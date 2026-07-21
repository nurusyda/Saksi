# SAKSI Data Model & State Machine

## Tables (Postgres / Supabase)

```sql
-- People are phones. No accounts.
create table parties (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique not null,          -- RLS-protected, never in public views
  phone_hash text unique not null,          -- sha256(phone_e164), public clustering key
  phone_verified_at timestamptz,            -- set by OTP success (Rp5rb+ or breach filing)
  ekyc_status text default 'NONE',          -- NONE | PASSED | FAILED (Didit)
  ekyc_ref text,                            -- Didit session id
  created_at timestamptz default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,               -- nanoid(21), the share link
  tier text not null default 'GRATIS',      -- GRATIS | LIMA_RIBU | BERMETERAI
  proposer_id uuid references parties,
  counterpart_id uuid references parties,   -- null until link opened & phone entered
  proposer_role text not null,              -- PENJUAL | PEMBELI | PEMBERI_PINJAMAN | ...
  item_desc text not null,
  amount_idr bigint not null,
  rekening_tujuan text not null,            -- destination account; masked in public views
  rekening_bank text not null,
  deadline date not null,                   -- target date both parties expect the whole
                                             -- exchange (payment + fulfillment) to be
                                             -- concluded by; anchors both TIDAK_DILANJUTKAN
                                             -- and KEDALUWARSA (resolved 2026-07-20 — see
                                             -- State machine section for the reasoning)
  status text not null default 'DRAF',
  meterai_applied boolean default false,
  created_at timestamptz default now()
);

-- Append-only witness log. NEVER update or delete rows.
create table deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid references deals not null,
  actor text not null,                      -- PROPOSER | COUNTERPART | SYSTEM
  event text not null,                      -- state-machine transition name
  payload jsonb,                            -- e.g. new deadline for PERPANJANGAN
  prior_hash text,
  new_hash text not null,                   -- sha256(canonical deal JSON after event)
  ots_proof bytea,                          -- OpenTimestamps proof, filled async
  created_at timestamptz default now()
);

create table bukti (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals not null,
  uploader text not null,                   -- PROPOSER | COUNTERPART
  kind text not null,                       -- TRANSFER | REFUND
  storage_path text not null,               -- private bucket
  ocr_result jsonb,                         -- {amount_match, date_ok, rekening_match, bank_match}
  ocr_verdict text,                         -- KONSISTEN | TIDAK_KONSISTEN | TIDAK_TERBACA
  attested boolean not null default false,  -- uploader checked the forgery-liability attestation
  created_at timestamptz default now()
);

create table flags (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid unique references deals not null,
  rung int not null default 0,              -- 0 claimed | 1 both-confirmed | 2 bank-verified
  identifiers jsonb not null,               -- {rekening_masked, bank, phone_hash?} per tier
  hak_jawab_status text default 'MENUNGGU', -- MENUNGGU | DIJAWAB | DISPUTED | KADALUARSA
  published_at timestamptz,
  created_at timestamptz default now()
);
```

RLS: `parties.phone_e164`, `bukti.storage_path` readable only by service role. Public views expose: masked rekening (first 2 + last 2 digits), bank name, phone_hash, counts, statuses, dates, account age.

## State machine

Happy path:
```
DRAF → DISEPAKATI → DIBAYAR_DIKLAIM → DIKONFIRMASI_TERIMA → SELESAI
```

**Redesigned 2026-07-20** (see below the two status descriptions for the full reasoning): the counterpart's join now fires both `COUNTERPART_JOINED` and `ACCEPTED` atomically in one transaction (migration 0025) — `DIAJUKAN` is no longer a resting state either party can observe in the normal path, and there is no separate manual accept step. `DIAJUKAN` itself is unchanged as a concept (still a valid status value, still the graph edge `ACCEPTED` fires from) — it's just instantaneous now rather than something a party waits in.

- `DRAF`: proposer filled form, link not yet opened. **Auto-delete after 7 days** (PII hygiene; walking away from an unformed deal is a right — no record survives).
- `DIAJUKAN`: counterpart opened link, entered phone — immediately followed, same transaction, by `ACCEPTED`. Declining here → record deleted, proposer privately notified. No public trace. (`COUNTERPART_DECLINED` remains defined in the state machine but has no UI wired to it today, same as before this redesign.)
- `DISEPAKATI`: both parties' consent, now derived automatically from create + join rather than a separate accept click — see "Accept step folded into join" below for why that's not a weaker consent model than before. Tier fee (if any) charged HERE, non-refundable. Hash anchored.

### Accept step folded into join — resolved 2026-07-20, replaces the old two-step accept flow

**What changed:** `acceptDeal` (the old separate DIAJUKAN screen — phone re-entry + a "Setuju" click, from each party independently) is removed. `joinDeal` now fires `ACCEPTED` itself, atomically, immediately after `COUNTERPART_JOINED`.

**Why this doesn't weaken consent:** attestations (the 4 checkboxes + T&C, copy-id.md §3) already happen at `createDeal` (proposer) and `joinDeal` (counterpart) — confirmed by re-reading both actions before this change. The old accept step collected zero new consent content; it was a second phone re-entry whose only effect was flipping `proposer_accepted`/`counterpart_accepted` to true. Both parties' actual consent is already fully captured by the time `joinDeal` runs — the accept click was confirming intent a second time, not gathering it for the first time.

**The one real tradeoff, resolved:** when the proposer is Pembeli, the counterpart (Penjual) supplies `rekening_tujuan` for the first time at join — the old accept step was the proposer's only chance to see that account before payment. Resolution: no separate confirm step for this either. Whoever the page routes to next (the payment screen — `DisepakatiPanel`/`DibayarDiklaimPanel`) already displays the rekening with the existing forced-check gate (`Lihat riwayat dulu` disabled until history resolves) before copying is even possible — the proposer sees it there, same protection, no extra click required.

**Phone re-entry, the actual complaint this redesign was responding to:** today's flow asked for a phone number up to 3 times (create/join, accept, then again on some later post-identification screens if the party-session cookie hadn't been set yet). Fixed by extending the existing party-session mechanism (`lib/db/partySession.ts`, previously only set at accept) to also fire at create (proposer) and join (counterpart) — paired with wiring both phone inputs through `usePersistedPhone()` (previously only the accept/identify forms did this), so `IdentifyPartyGate`'s existing skip condition (`initialWhichParty && phone`) is satisfied immediately after create/join instead of only after a since-removed accept step.

**Schema:** `join_deal_with_event` (migration 0004, extended 0013) now takes two prior/new hash pairs instead of one and writes both `deal_events` rows plus the `DRAF → DISEPAKATI` status update in a single guarded transaction (migration 0025) — same row-lock + stale-prior_hash-recheck pattern migration 0011 added for the old two-step accept RPCs, needed here for the identical reason (both hashes are computed client-side before the call). `record_party_acceptance`/`finalize_deal_acceptance` (0008, patched by 0011), the `proposer_accepted`/`counterpart_accepted` columns (0007), and `accept_attempts` (0010) are all dropped in 0025 — dead code with no remaining callers once `acceptDeal` is removed, not left dormant.
- `DIBAYAR_DIKLAIM`: payer uploaded bukti (attested), OCR ran. This is a CLAIM — rung 0 language everywhere.
- `DIKONFIRMASI_TERIMA`: payee confirmed receipt in-app. Deal is now rung-1 eligible. (Skippable — payee may ghost.)
- `SELESAI`: recipient of goods/repayment confirms fulfillment. Terminal, positive.

Exit states (D5 — all terminal unless noted):
- `DIBATALKAN_BERSAMA`: either side proposes cancel, other accepts. Weight: none. Mandatory exit door. **Guard: valid only from `DISEPAKATI`. Unreachable once `DIBAYAR_DIKLAIM` exists — after a payment claim, the only exits are `DIKEMBALIKAN_PENUH`, `DIKEMBALIKAN_SEBAGIAN`, or the breach pipeline.**
- `TIDAK_DILANJUTKAN`: one side explicitly cancels or the deadline lapses with no payment ever claimed and no mutual cancel agreed. Recorded as its own category (this is HnR). Light weight.
- `KEDALUWARSA` (terminal): from `DIBAYAR_DIKLAIM`, 30 days past deadline with no confirmation, no SELESAI, and no laporan ever filed — a filed laporan routes into the breach pipeline instead. Records genuine mutual silence. No weight against either party.
- `DIKEMBALIKAN_PENUH`: after payment, seller exits honestly — uploads bukti refund (kind=REFUND), buyer confirms. Neutral-positive. **The refund screen MUST display the N8 warning (copy-id.md §4) — refund scams solicit additional transfers.**
- `DIKEMBALIKAN_SEBAGIAN`: after payment, seller exits partially — uploads bukti refund (kind=REFUND) for a partial amount, buyer confirms. Neutral-positive, mirrors `DIKEMBALIKAN_PENUH`. **The refund screen MUST display the N8 warning (copy-id.md §4) — refund scams solicit additional transfers.**
- `TIDAK_DIPENUHI`: deadline passed after payment claim/confirmation, no delivery, no response within the 14-day hak jawab window → flag published at the correct rung. The heavy terminal state.
- `SENGKETA` (non-terminal): flagged party responds within 14 days disputing. Flag shows DISPUTED. Mid-dispute silence for 14 more days → recorded as "tidak merespons dalam 14 hari".

Extension (applies to ANY deal, any tier — deferred obligations are the norm in jastip/PO/loans):
- `PERPANJANGAN`: from DISEPAKATI / DIBAYAR_DIKLAIM / DIKONFIRMASI_TERIMA, either party proposes a new deadline; counterpart must accept. Event payload stores old + new deadline. Public record line: "Batas waktu diperpanjang ke [tgl], disepakati kedua pihak." Unlimited extensions, each witnessed. A deadline lapse during a pending un-accepted extension proposal still counts as lapse — acceptance is what moves the date.

  **Redesigned 2026-07-20** (state-machine wiring for this was previously written, then removed — see ROADMAP.md Tier A+ — because the procedure below hadn't been thought through yet; no contradiction found against the paragraph above during this pass, so nothing there changed, only the mechanics are now specified):

  - **Extension count**: unlimited, as stated above — confirmed, no constraint added. Note the distinction: unlimited *proposals* is safe because only an *accepted* proposal moves `deadline`; a party spamming proposals the counterpart never accepts changes nothing. A light rate limit on the propose action is recommended purely as the same abuse-prevention hygiene already applied to every other mutating action in this app (`identify_attempts`, `accept_attempts`, the 20/day create-deal cap) — not a constraint on legitimate extension count.
  - **In-flight breach timer**: already answered by the locked paragraph above — the original `deadline` keeps ticking regardless of a pending proposal. This means the deadline sweep (Phase 6) needs zero awareness of PERPANJANGAN at all: it only ever reads `deals.deadline`, and that column is untouched until `PERPANJANGAN_ACCEPTED` actually fires.
  - **Unilateral extension**: not permitted, per the locked paragraph — counterpart consent required. This is the only part of the "accept" question the locked spec actually answers; everything below about what "accept" means procedurally is new.
  - **What "accept" means procedurally (not covered by the locked spec, new)**: phone re-entry to identify which party is responding (`identifyPartyByPhone`, the same no-session/no-account identity model used everywhere in this app) plus a confirm action — **not** a repeat of the 4 join-time attestations. Proposed reasoning: those attestations are about *first-time* identity/data-processing consent for joining the deal; a party negotiating an extension has already given that consent once at DISEPAKATI. This mirrors `IdentifyPartyGate`'s phone + confirm flow (no checkboxes) rather than `joinDeal`'s fuller one — but that mirroring is a design choice being made here, not something the locked paragraph implies on its own. (Corrected 2026-07-20: this used to cite the old `acceptDeal`, since removed — see "Accept step folded into join" above; `IdentifyPartyGate` is the closer surviving analog for the same phone-plus-confirm-no-checkboxes shape.) The proposing party also re-enters their phone before proposing, matching the "no session, re-verify identity on every mutating action" pattern used by every other action in this app (`submitBukti`, `confirmReceipt`, `confirmFulfillment`, the sweep's `identify_attempts`-gated actions).
  - **Sweep interaction**: as above — none needed. `PERPANJANGAN_ACCEPTED` writes the new date directly into `deals.deadline`, the same column the sweep already reads, so "the sweep needs to stop tracking the old deadline" is automatic, not a separate mechanism. **One real gap this surfaces, to fix when this is built**: `get_nudge_candidates()` (migration 0018) currently checks "no `NUDGE_SENT` event has *ever* occurred" — but a deal nudged once, then extended, would never be nudged again under its new deadline, since the old `NUDGE_SENT` row is still in the append-only log. When PERPANJANGAN ships, that candidate query needs to instead check "no `NUDGE_SENT` since the most recent `PERPANJANGAN_ACCEPTED`" (or simpler: since the most recent `deadline`-changing event).
  - **Blocking other actions**: no. A pending proposal is purely informational until accepted — `submitBukti`/`confirmReceipt`/`confirmFulfillment` proceed independently of whether an extension is pending. Extensions are a parallel witnessed thread, not a gate, matching "unlimited extensions, each witnessed" — they add to the record, they don't block it.
  - **Payload shape**: `{ old_deadline, new_deadline }` (both ISO dates) for both `PERPANJANGAN_PROPOSED` and `PERPANJANGAN_ACCEPTED` — matches the locked spec's "old + new deadline" exactly, and recording it on both events (not just acceptance) means the pending proposal's terms are already in the tamper-evident chain before anyone accepts.
  - **Proposal expiry**: no separate expiry event. A pending, unaccepted proposal becomes moot automatically once the deal's status changes away from one of the three eligible states (deadline lapses into `TIDAK_DIPENUHI`/`KEDALUWARSA` per the paragraph above, or the deal reaches `SELESAI`/a cancellation exit) — the existing prior-hash recheck under the RPC's row lock naturally rejects a stale accept attempt at that point, the same protection every other action in this app already relies on. No new machinery needed. (Design call, flagged: if a shorter, explicit expiry window is wanted instead of relying on the natural deadline backstop, that's a deliberate product decision to make separately, not something implied by the locked spec.)
  - **Pending-proposal guard (not covered by the locked spec, new)**: only one pending proposal at a time. While `pending_new_deadline` (new column, below) is non-null, the *same* proposer may revise it (a new `PERPANJANGAN_PROPOSED` event overwriting the pending value), but the counterpart cannot submit a competing proposal — they accept the existing one or wait. Avoids two simultaneous conflicting offers. **Who counts as "the same proposer" is resolved by looking up the most recent `PERPANJANGAN_PROPOSED` event's `actor` from `deal_events` at guard-check time (option (a), not a new column) — consistent with "materialized state is a cache of events, never a second source of truth," the same philosophy migration 0007's comment already states for `proposer_accepted`/`counterpart_accepted`.** `pending_new_deadline` itself stays a plain cache of *whether* a proposal is pending and *what* it proposes (mirroring `proposer_accepted`/`counterpart_accepted`'s existing role); *who* proposed it is derived from the event log, not stored redundantly in a second column.
  - **Decline (not covered by the locked spec, new)**: a `PERPANJANGAN_DECLINED` self-transition, symmetric to the join step's existing `COUNTERPART_DECLINED`, giving the counterpart an explicit witnessed way to say no rather than only ever silently not-accepting. Clears `pending_new_deadline`, no deadline change.

  **Procedure** (same style as the breach pipeline above):
  1. Either party (having already passed the join-time attestations once) re-enters their phone to identify themselves, then proposes a new deadline. Rejected if a proposal is already pending from *the other* party (determined by reading the most recent `PERPANJANGAN_PROPOSED` event's actor from `deal_events`, per the guard above), or if the deal isn't in `DISEPAKATI`/`DIBAYAR_DIKLAIM`/`DIKONFIRMASI_TERIMA`.
  2. `PERPANJANGAN_PROPOSED` fires (self-transition, actor = proposer's slot, payload `{old_deadline, new_deadline}`). Writes `deals.pending_new_deadline = new_deadline`. Row-lock + prior-hash-recheck RPC, same shape as `submit_bukti_with_event` (migration 0015) — one `UPDATE` (`pending_new_deadline`) + one `INSERT` (`deal_events`) per call.
  3. The counterpart sees the pending proposal on the deal page, re-enters their phone to identify themselves, and either accepts or declines.
  4. Accept → `PERPANJANGAN_ACCEPTED` fires (self-transition, actor = accepting party's slot, payload `{old_deadline, new_deadline}`, same values as step 2 for audit symmetry). Writes `deals.deadline = new_deadline`, `deals.pending_new_deadline = null`. Same RPC pattern as step 2. Decline → `PERPANJANGAN_DECLINED` fires (self-transition, clears `pending_new_deadline`, no deadline change).
  5. Public record line renders per the locked copy: "Batas waktu diperpanjang ke [tgl], disepakati kedua pihak" — sourced from the `PERPANJANGAN_ACCEPTED` event's `new_deadline`.

  **Schema addition needed** (DDL comment, not a migration — this is a design pass, no code written):
  ```sql
  -- alter table deals add column pending_new_deadline date; -- nullable; materialized
  -- cache of WHETHER a proposal is pending and WHAT it proposes, same "cache, not
  -- source of truth" philosophy already used for proposer_accepted/counterpart_accepted
  -- (migration 0007) -- only ever written by the PERPANJANGAN RPCs, in the same
  -- transaction as the deal_events row. WHO proposed it is deliberately NOT a column --
  -- derived from deal_events at guard-check time instead (see "Pending-proposal guard").
  ```

  **Draft `lib/db/transitions.ts` entries** (spec only, not applied):
  ```ts
  // New DealEventName members:
  PERPANJANGAN_PROPOSED: 'PERPANJANGAN_PROPOSED',
  PERPANJANGAN_ACCEPTED: 'PERPANJANGAN_ACCEPTED',
  PERPANJANGAN_DECLINED: 'PERPANJANGAN_DECLINED',

  // New VALID_TRANSITIONS entries, added to the three existing eligible states
  // (all self-transitions -- next equals the same status the entry is under,
  // exactly matching how the removed wiring modeled this before, and how
  // NUDGE_SENT/REFUND_UPLOADED already self-transition today):
  [DealStatus.DISEPAKATI]: [
    // ...existing entries...
    { event: DealEventName.PERPANJANGAN_PROPOSED, next: DealStatus.DISEPAKATI },
    { event: DealEventName.PERPANJANGAN_ACCEPTED, next: DealStatus.DISEPAKATI },
    { event: DealEventName.PERPANJANGAN_DECLINED, next: DealStatus.DISEPAKATI },
  ],
  [DealStatus.DIBAYAR_DIKLAIM]: [
    // ...existing entries...
    { event: DealEventName.PERPANJANGAN_PROPOSED, next: DealStatus.DIBAYAR_DIKLAIM },
    { event: DealEventName.PERPANJANGAN_ACCEPTED, next: DealStatus.DIBAYAR_DIKLAIM },
    { event: DealEventName.PERPANJANGAN_DECLINED, next: DealStatus.DIBAYAR_DIKLAIM },
  ],
  [DealStatus.DIKONFIRMASI_TERIMA]: [
    // ...existing entries...
    { event: DealEventName.PERPANJANGAN_PROPOSED, next: DealStatus.DIKONFIRMASI_TERIMA },
    { event: DealEventName.PERPANJANGAN_ACCEPTED, next: DealStatus.DIKONFIRMASI_TERIMA },
    { event: DealEventName.PERPANJANGAN_DECLINED, next: DealStatus.DIKONFIRMASI_TERIMA },
  ],
  ```

## Loan (two-leg pinjam-meminjam) — design pass, 2026-07-20, not built

ROADMAP.md Tier A+: the current schema's single `amount_idr` column, and the single DISEPAKATI→DIBAYAR_DIKLAIM→DIKONFIRMASI_TERIMA→SELESAI happy path, only records a loan's *repayment* leg — a real pinjam-meminjam deal has two: the lender disbursing, then the borrower repaying. This section is that design. Pinjam-meminjam is currently gated off entirely (createDeal rejects any `proposer_role` besides `PENJUAL`/`PEMBELI` — Section B), so none of this is reachable yet; nothing here is retrofitted onto a working feature.

- **Schema — one deal, two columns, not sub-records.** "One deal = one record = one row in `deals`, with append-only `deal_events` capturing every transition" is a locked architecture rule (saksi-builder/SKILL.md), not something this design pass should override. New column `amount_disbursed_idr bigint` alongside the existing `amount_idr` (which keeps its current meaning: the repayment amount). Kept as a separate column rather than assuming disbursement == repayment, since nothing in the locked spec says loans are interest-free — but no interest *mechanism* is being designed here either; this just leaves room for the two amounts to differ without requiring it.

- **State machine — sequential prefix, not a parallel track.** Considered a second, parallel status dimension (e.g. a `disbursement_status` column alongside `status`) and rejected it: `deals.status` being a single "materialized latest-state" column is also a locked architecture rule, and a second status dimension would double it. Instead: two new `DealStatus` values, `DANA_DICAIRKAN_DIKLAIM` and `DANA_DIKONFIRMASI_DITERIMA`, inserted **only** in the transition graph between `DISEPAKATI` and the existing `DIBAYAR_DIKLAIM` — for pinjam-meminjam deals specifically. Jual-beli and sewa-menyewa deals never construct a request that traverses these two states (their own code goes straight `DISEPAKATI` → `BUKTI_UPLOADED` → `DIBAYAR_DIKLAIM`, unchanged), so this self-gates through which server actions exist for which deal type rather than needing a deal-type conditional inside the graph itself. Answers "does jual-beli-only gating affect the design": yes — this whole section is pinjam-meminjam-specific and doesn't touch jual-beli/sewa-menyewa's existing graph at all, not designed generically across all three types.

  **Resolved 2026-07-20**: `RECEIPT_CONFIRMED` and `FULFILLMENT_CONFIRMED` collapse into one step for pinjam-meminjam's repayment leg (leg 2) — unlike jual-beli, both steps would be the same party (`PEMBERI_PINJAMAN`, the lender) confirming the same fact (money arrived), and there's no partial-repayment schema giving a second confirmation anything distinct left to verify. `DIBAYAR_DIKLAIM` transitions straight to `SELESAI` on the lender's confirmation, skipping `DIKONFIRMASI_TERIMA` entirely for this deal type.

  **Structural consequence, flagged**: `VALID_TRANSITIONS` is a flat `{event, next}` list per status, and `assertTransition` resolves an event to its `next` status by name lookup alone — it has no deal-type awareness. Reusing the existing `RECEIPT_CONFIRMED` event name for *both* jual-beli's `DIBAYAR_DIKLAIM → DIKONFIRMASI_TERIMA` edge *and* pinjam-meminjam's collapsed `DIBAYAR_DIKLAIM → SELESAI` edge would put two entries with the same event name and different `next` values under `[DealStatus.DIBAYAR_DIKLAIM]`, which `assertTransition`'s `.find()` can't disambiguate — it would always resolve to whichever is listed first, regardless of deal type. Proposed fix (naming only, open to revision — not specified by the collapse decision itself): a **new**, distinct event name, `REPAYMENT_CONFIRMED`, used only for pinjam-meminjam's collapsed edge; the existing `RECEIPT_CONFIRMED`/`FULFILLMENT_CONFIRMED` pair stays exactly as-is for jual-beli/sewa-menyewa. Keeps the state graph a static, unambiguous table — the deal-type branching lives in the server action that decides which event to fire, not in the graph itself.

  **Payload shape**: `REPAYMENT_CONFIRMED`'s event payload is `null`, same as `RECEIPT_CONFIRMED`'s actual implementation (`paymentActions.ts`, `confirmReceipt`) — stated explicitly here rather than left implied by the name similarity, since there's nothing else to record: no partial-repayment schema (per the collapse decision above) means there's no second value like PERPANJANGAN's `{old_deadline, new_deadline}` for it to carry.

  **Graph-shape consequence, flagged**: this makes pinjam-meminjam's reachable-status sequence shorter than jual-beli/sewa-menyewa's — it skips `DIKONFIRMASI_TERIMA` and never fires `FULFILLMENT_CONFIRMED` at all. Anything that currently assumes a uniform status sequence across deal types will need to become deal-type-aware once this is built, most notably `DealTimeline.tsx` (currently a flat `TIMELINE_EVENT_LABELS` lookup with no deal-type branching) and any future "what happens next" UI copy. Not a contradiction of anything locked — jual-beli's own sequence is untouched — just a new asymmetry between deal types that didn't exist while jual-beli was the only reachable one.

  ```
  Two-leg pinjam-meminjam path:

  DRAF → DIAJUKAN → DISEPAKATI
                        │
                        ▼  (leg 1 — disbursement, NEW)
                  DANA_DICAIRKAN_DIKLAIM
                        │  new event, see "which party does what" below
                        ▼
                DANA_DIKONFIRMASI_DITERIMA
                        │  BUKTI_UPLOADED (existing event, repayment leg starts)
                        ▼  (leg 2 — repayment, mostly-existing mechanism)
                  DIBAYAR_DIKLAIM ──────────────────── (existing refund/breach/
                        │  REPAYMENT_CONFIRMED (new,     KEDALUWARSA paths,
                        │  collapsed -- see above)        unchanged, repayment-
                        ▼                                  leg-scoped only)
                     SELESAI

  (jual-beli/sewa-menyewa's own DISEPAKATI → DIBAYAR_DIKLAIM → DIKONFIRMASI_TERIMA
  → SELESAI path is completely unchanged -- this is a separate, longer path that
  only pinjam-meminjam deals ever enter.)
  ```

- **Which party does what, per leg** — mirrors the existing jual-beli pattern (payer uploads bukti, payee confirms) applied twice, once per direction of money flow:
  - Leg 1 (disbursement): `PEMBERI_PINJAMAN` (lender) is the payer — uploads bukti of disbursement (`DISEPAKATI` → `DANA_DICAIRKAN_DIKLAIM`). `PEMINJAM` (borrower) is the payee — confirms receipt (`DANA_DICAIRKAN_DIKLAIM` → `DANA_DIKONFIRMASI_DITERIMA`).
  - Leg 2 (repayment): `PEMINJAM` is the payer — uploads bukti of repayment (`DANA_DIKONFIRMASI_DITERIMA` → `DIBAYAR_DIKLAIM`, reusing the existing `BUKTI_UPLOADED` event). `PEMBERI_PINJAMAN` is the payee — confirms receipt *and closes the loan in the same action* (`DIBAYAR_DIKLAIM` → `SELESAI`, the new collapsed `REPAYMENT_CONFIRMED` event).
  - `PEMBERI_PINJAMAN`/`PEMINJAM` swap payer/payee roles between the two legs — correct and expected, since money physically flows in opposite directions each time.

- **Hash chain — one deal, more events.** Directly answered by the locked architecture rule cited above: append-only `deal_events` on the single deal row, not a second deal or a second event log. Leg 1 gets its own two events (disbursement-claimed, disbursement-confirmed); leg 2 reuses `BUKTI_UPLOADED` and gets the new collapsed `REPAYMENT_CONFIRMED`. The full two-leg lifecycle is one deal's `deal_events` history, longer than jual-beli's in the middle, shorter at the end (per the graph-shape consequence above).

- **Interaction with refund exit states — scoped to the repayment leg only, not "partial by definition."** `DIKEMBALIKAN_PENUH`/`DIKEMBALIKAN_SEBAGIAN` are already reachable only from `DIBAYAR_DIKLAIM` in the existing graph — under this design that's leg 2 (repayment), and that scoping is kept as-is, not widened. Reasoning: a "refund" of the *disbursement* leg doesn't need its own mechanism, because reversing a disbursement **is** repayment — a borrower giving back a loan they just received early is just the existing leg-2 flow starting immediately, not a new refund-like state. The exit-state machinery (`DIBATALKAN_BERSAMA`, `TIDAK_DILANJUTKAN`, `KEDALUWARSA`) is proposed to extend symmetrically to the new leg-1 states instead: `DIBATALKAN_BERSAMA` valid only from `DISEPAKATI` (unreachable once `DANA_DICAIRKAN_DIKLAIM` exists, mirroring the existing guard's "once a payment claim exists" logic applied to the *first* claim now being disbursement, not repayment), and a `KEDALUWARSA`-equivalent path from `DANA_DICAIRKAN_DIKLAIM` (borrower never confirms receipt, nobody ever reports) mirroring the existing `DIBAYAR_DIKLAIM` → `KEDALUWARSA` path.

- **Copy — resolved.** copy-id.md §14's `Konfirmasi uang sudah dikembalikan` becomes the label for the **collapsed** step — the single `REPAYMENT_CONFIRMED` action that both confirms receipt and closes the loan (`DIBAYAR_DIKLAIM` → `SELESAI`), not a separate later fulfillment step. Not touching copy-id.md itself yet — this stays a design-doc note; the string is already locked as-is and its *meaning* (which transition it labels) is what changed here, not its text. Still needed, not drafted here since it postdates this resolution: leg-1 labels (disbursement claim + confirm-receipt + the "Option A, not received" mirror of jual-beli's "Dana belum masuk"), none of which exist in copy-id.md today — wording should follow the now-resolved flow, to be drafted when this gets built.

- **Open gap, flagged, not resolved here: PERPANJANGAN eligibility for the two new leg-1 states.** The locked PERPANJANGAN spec's eligible source states are `DISEPAKATI`/`DIBAYAR_DIKLAIM`/`DIKONFIRMASI_TERIMA` — written before `DANA_DICAIRKAN_DIKLAIM`/`DANA_DIKONFIRMASI_DITERIMA` existed. As currently specified, a lender who needs more time before disbursing has no way to propose a deadline extension while the deal sits in `DANA_DICAIRKAN_DIKLAIM`. Not silently adding the two new states to PERPANJANGAN's eligible-states list here — that's a separate decision (this section doesn't touch the Extension section above), just flagging that the two designs don't yet cover each other's states.

- **Open gap, flagged, not resolved here: what "deadline" means across two legs.** The core `deals.deadline` field is now documented (Tables section, resolved 2026-07-20) as "the date both parties expect the *whole exchange* to be concluded by." For the two-leg case that raises a question this design pass doesn't answer: does "whole exchange concluded" mean by *repayment* (the loan's actual end, leg 2) — leaving disbursement (leg 1) with no deadline of its own — or does leg 1 need its own implicit target date, distinct from `deadline`, so a stalled disbursement and a stalled repayment aren't both silently measured against the same single date? Not resolved here; pinjam-meminjam is still gated off.

- **DDL comment** (not a migration — design pass, no code):
  ```sql
  -- alter table deals add column amount_disbursed_idr bigint; -- leg-1 amount; existing
  -- amount_idr keeps its current meaning (leg-2 / repayment amount) unchanged.
  -- DANA_DICAIRKAN_DIKLAIM and DANA_DIKONFIRMASI_DITERIMA added to the existing
  -- deals_status_check constraint (migration 0006's pattern: catalog-lookup drop +
  -- re-add, not a hardcoded name) the same way KEDALUWARSA/DIKEMBALIKAN_SEBAGIAN
  -- were added there.
  ```

## Full transaction ledger + reputation-gaming signals (rekening/phone drill-down) — built 2026-07-20, gated behind LEDGER_DETAIL_ENABLED

ROADMAP.md's Post-launch entry of the same name is the locked spec for *what* this is and *why* — entry point (click-through only, never standalone search), the "no bumbu" content rule, and the five gaming-detection signals in priority order are all resolved there and not relitigated here. This section resolves what that entry left open: the entry-point mechanism concretely, exactly which per-deal fields are exposed, the five signals specified precisely enough to implement, a draft T&C clause, and the schema footprint (none, as it turns out).

**Built, not live**: `lib/db/ledger.ts` (rows + signals 1-4), `checkPairCompletionLimit` wired into `confirmFulfillment` (signal 5), `components/LedgerDetail.tsx` wired into all three account-history call sites, §4A added to `syarat-ketentuan.md`. Gated behind `LEDGER_DETAIL_ENABLED` (ops.md) pending GATE 1 — nothing here is reachable until that's set to `'true'`.

### Entry-point mechanism — resolved this pass: not a new route at all

The ROADMAP entry fixes the *trigger* ("Lihat detail lengkap" under the aggregate line) but not the *mechanism*. Considered a new page (`/cek/detail?...`) and rejected it: any URL-addressable route puts bank+rekening (or a phone_hash) into browser history, referrer headers, and server access logs — a strictly larger exposure surface than the existing account-history check, which never leaves a URL trail (the /cek lookup and both forced-check cards are all server-action POSTs, no GET params, per the app's existing "raw identifier never reaches a query log" posture applied to phone_e164 today).

Instead: **expand-in-place, no new route.** The three existing call sites (`app/buat/page.tsx`'s ungated card, `app/deal/[token]/DisepakatiPanel.tsx`'s gated forced-check card, `app/cek/CekForm.tsx`'s public result) already hold the bank+rekening or the raw phone the visitor typed, in local component state, right where `formatAccountHistory`/`formatAccountHistoryFull` currently renders. "Lihat detail lengkap" is a button that calls a second server action (`getRekeningLedger(bank, rekening)` / `getPhoneLedger(phoneE164)`, phone hashed server-side same as every existing lookup) using data already in scope, and renders the ledger inline below the existing count line. No new URL, so nothing to noindex, nothing to keep unlinked — it structurally cannot become a standalone lookup tool, which is a stronger guarantee than UI convention alone gives `/cek` today.

**Consequence for the GATE 2 concern:** since there's no new page, this doesn't add a new "discovery surface" in the sense Option A cares about (crawlable/bookmarkable URLs). It's still gated by GATE 1 (see below) and by the T&C gap, but not by GATE 2's noindex/no-links mechanism specifically — that mechanism has nothing to attach to here.

### Per-deal field scope — resolved this pass

**Bounding principle:** the ledger's deal universe is exactly the set of deals that already contribute to the existing 8-bucket aggregate count (this file's Profile page section / copy-id.md §18) — never an in-progress deal (nothing between DISEPAKATI and a terminal/exit state), and never a `TIDAK_DIPENUHI`/klaim-berbeda deal before its flag is actually published (the same GATE 1 check `accountHistory.ts`'s `buildHistoryFromDeals` already applies to the aggregate counts extends unchanged to the per-deal list — an unpublished report contributes to neither the count nor a row). The ledger doesn't invent a new disclosure category of *which deals exist*; it only adds detail to ones already counted.

**Per-deal fields, resolved:**
- **Status + date** — already in scope per the ROADMAP entry. Date is the deal's terminal/latest `deal_events` timestamp (matching §7's `[tgl]` convention — the date of the transition being recorded, not `deals.created_at`), not the creation date.
- **item_desc** — **include.** Not a new exposure category: `deals_public` (migration 0001) already defines `item_desc` as a public-safe column (unused by any current reader, but already decided safe). Serves the ledger's actual purpose — "5 kesepakatan tidak dipenuhi" means nothing to a viewer without knowing what was being transacted.
- **amount_idr** — **include, exact figure, not a range.** Same reasoning: `deals_public` already exposes `amount_idr` unmasked as a defined-safe column. This is the one item the ROADMAP entry explicitly left open ("amount range? ... still open") — flagging it as a real decision, not silently defaulting: exact amount matches the existing view's own floor and is more useful for a viewer sanity-checking a claim (a range obscures exactly the kind of comparison — "does this match what I was quoted?" — the ledger exists to enable). **Needs your confirmation**, not locked by this pass alone.
- **Counterpart identifier (phone_hash)** — **include, tier-gated identically to the flag ladder.** This is the genuinely new exposure: cross-linking a rekening to every phone_hash that has transacted with it, across *all* outcomes, not just breach flags. Rather than invent a new disclosure rule, this reuses the existing one verbatim — data-model.md's Breach pipeline section already draws the line at GRATIS (no phone_hash) vs LIMA_RIBU+ (phone_hash included), because GRATIS deals carry no phone-verification signal. Applying that same per-deal tier gate here (checked against *that specific deal's* tier, not the rekening's overall history) means a GRATIS deal's row shows status/date/item_desc/amount only; LIMA_RIBU+ rows additionally show the *other* party's phone_hash (i.e. whichever of proposer/counterpart is NOT the rekening's owner for that deal — see next point). **Also needs your confirmation** — this is the single biggest new privacy surface in the feature and shouldn't ship on my judgment call alone.
- **Which side owns the rekening, per deal** — worth stating explicitly since it's easy to get backwards: `rekening_tujuan` is captured at join time (migration 0013) from whichever party is the *payee* for that deal type (Penjual in jual-beli, Pemberi Pinjaman in pinjam-meminjam). Since `proposer_role` is chosen per-deal, the *same* literal rekening number can appear as `rekening_tujuan` under *different* proposer phone_hashes across different deals — that's precisely the "shared/rented drop account" pattern the cross-linkage requirement is meant to surface, not an edge case to filter out.
- **Explicitly excluded, no ambiguity:** raw phone number (ever), bukti images, breach `field_note`/hak-jawab `response_note` free text (both already service-role-only per `breach_notes`), hak-jawab evidence file/signed URL. None of these are in `deals_public`'s existing floor and the ROADMAP entry doesn't ask for them.
- **Pagination** — not addressed by the ROADMAP entry. Proposing a simple default: most-recent-first, hard-capped at 50 rows for v1, no "load more" — flagging as a placeholder decision, not a considered one; revisit if a rekening's real deal count ever approaches that in practice.

### "No bumbu" — how it's actually enforced, not just restated

The ROADMAP entry already locks the principle; the operational question this pass answers is *where the line sits* between "compute quietly" and "show the viewer a sentence." Resolution: **a threshold gates whether a signal line renders at all; it never gates what the line says once it renders.** Every signal line, when shown, is the same flat "N dari M" / "N kesepakatan dalam M hari" construction — no adjectives, no "mencurigakan," no severity tiers, matching the ROADMAP's own worked example verbatim. The threshold's only job is avoiding noise (a normal account with one deal and no repeat counterparts doesn't need "0 dari 1" rendered at it) — it is never phrased as a judgment, and low-N accounts simply show no signal lines rather than a reassuring "tidak ada pola mencurigakan" (which would violate the no-reassurance invariant the same way an empty-state softening would).

### The five signals, specified precisely

All five operate only over deals already in the ledger's bounded universe (above) — no new tables, no new integrations; every input already exists in `deals`, `deal_events`, `parties`, `flags`.

**1. Concentration ratio.** Among a rekening's `SELESAI` deals only (this signal targets manufactured-clean-record wash-trading specifically, not disputes), find the single counterpart `phone_hash` with the most deals against this rekening. Render only if `SELESAI` count ≥ 3 **and** that top counterpart's share ≥ 60%. Line: `[N] dari [M] kesepakatan selesai dengan pihak yang sama.` Both thresholds are proposed defaults, not locked — flag for confirmation/tuning.

**2. Velocity/timing.** For the same top-concentration counterpart from signal 1, count how many of *their* `SELESAI` deals against this rekening completed in under 1 hour, measured `ACCEPTED` → the terminal confirming event (`FULFILLMENT_CONFIRMED` for jual-beli/sewa-menyewa, the collapsed `REPAYMENT_CONFIRMED` for pinjam-meminjam once built). Render only if that fast-completion count ≥ 2. Line: `[N] dari kesepakatan tersebut selesai dalam waktu kurang dari 1 jam.` Deliberately phrased as a qualifier *on* signal 1's line (only ever shown alongside it, never standalone) rather than a second independent counterparty computation — avoids two signals silently disagreeing about who "the same pair" even is. 1-hour threshold is a proposed default, not locked.

**3. Volume vs. account age.** Count `SELESAI` deals at this rekening whose terminal event fell within 48 hours of the rekening's earliest recorded deal (`sinceLabel`'s underlying earliest `created_at`, already computed today). Render only if that count ≥ 5. Line: `[N] kesepakatan selesai dalam 48 jam pertama sejak tercatat.` Threshold proposed, not locked.

**4. Show the raw pattern, don't auto-judge.** Not a separate computed signal — this is the rendering rule the three lines above already follow (see "No bumbu" above): plain facts, always separately displayed, **never combined into one derived score or severity label.** Worth stating explicitly as its own constraint: a future edit that tries to "summarize" signals 1–3 into a single risk indicator would violate this as directly as adding a star rating would.

**5. Rate-limit the pair — a real behavioral change, not just a ledger fact, and the one genuine product tradeoff in this design.** Unlike 1–4 (read-only, rendered in the ledger), this blocks a mutating action: reusing the existing rate-limit idiom (20 deals/day/phone_hash, 3 OTP/hour) as a circuit breaker on `confirmFulfillment`/the future `REPAYMENT_CONFIRMED` action — if firing it would be the 6th `SELESAI` between this exact `(proposer_phone_hash, counterpart_phone_hash)` pair (order-independent) within a rolling 30 days, the transition is rejected instead of completing. No new table needed: a plain `COUNT` over existing `deals` rows for the pair, `status = 'SELESAI'`, within the window — same shape as `app/buat/actions.ts`'s existing 20/day check, same known-TOCTOU caveat noted and accepted rather than over-engineered (per ROADMAP.md's own Tier B entry on that exact pattern).
   **Flagging the tradeoff directly, not deciding it silently:** this WILL occasionally block a real recurring relationship — a landlord and a long-term kos tenant, a jastip buyer who orders from the same seller monthly — from confirming a perfectly genuine transaction, purely because the pair pattern-matches wash-trading. That's the nature of a blunt circuit breaker (the same tradeoff the existing 20/day cap already accepts). 5/30-days is a proposed starting threshold, generous enough to leave real monthly-cadence relationships alone while still capping same-day/same-week rapid repetition.

   **Confirmed 2026-07-20: 5/30-days threshold, hard block.** Kos/pinjam-meminjam are still gated off entirely (Section B), so the main legitimate high-frequency case (monthly rent) isn't reachable through this yet — narrows the realistic false-positive surface to jual-beli/jastip repeat-customer patterns, which are a real but smaller risk than the original framing assumed.

   **Recourse path — resolved 2026-07-20, before this ships (not before the design locks):** checked, and no rate limit anywhere else in this app (20/day create cap, 3/hour OTP, `/cek`'s lookup limit) offers a human-recourse path today — all of them are "coba lagi nanti" relying on the window expiring. The only support contact in the entire product is `sapa@saksi.app`, referenced only in the two legal docs' footers, never inline in a product error state. Proposed, deliberately small since this app has no admin tooling at all yet (every operational fix so far has been direct Supabase access): reuse `sapa@saksi.app` as the channel; recourse is a human manually intervening via the dashboard if warranted, not a built override feature — stated honestly, not dressed up as a polished support flow. Draft blocked-state copy (new, needs review before locking, same discipline as every other string):
   > `Konfirmasi ditunda sementara: terlalu banyak kesepakatan selesai dengan pihak yang sama dalam waktu singkat. Ini batas otomatis untuk semua pengguna, bukan penilaian atas kesepakatan Anda — kesepakatan ini tetap tercatat apa adanya. Butuh bantuan lebih cepat? Hubungi sapa@saksi.app.`

   Deliberately states the limit is systemic, not an accusation about this specific pair, and that the deal record itself is untouched — only the confirmation action is paused.

### T&C gap — draft clause (DRAFT, not applied to `content/legal/syarat-ketentuan.md` — same discipline as any other locked string: confirm here first)

The ROADMAP entry identifies the gap precisely: §4 only authorizes publishing *unfulfilled* agreements; this feature publishes `SELESAI` records and phone-to-rekening cross-linkage too. Proposed as a new §4A, immediately after the existing §4 (keeping §4 itself untouched — it's already-locked, load-bearing text), matching the document's numbered-clause register and its existing pattern of stating the mechanism plainly rather than burying it in defined terms:

> ## 4A. Riwayat lengkap rekening dan nomor HP
>
> 1. Selain catatan kesepakatan tidak terpenuhi (Bagian 4), SAKSI juga menampilkan riwayat lengkap sebuah nomor rekening atau nomor HP kepada siapa pun yang memeriksanya di SAKSI, mencakup kesepakatan yang selesai maupun yang tidak, tanggal, dan nomor HP pihak lain yang tercatat bertransaksi dengan rekening tersebut (dalam bentuk sidik jari nomor HP, bukan nomor HP itu sendiri, kecuali pada tingkatan layanan yang menampilkannya sebagaimana diatur pada Bagian 4).
> 2. Riwayat ini ditampilkan sebagai catatan peristiwa, bukan penilaian: SAKSI tidak menyimpulkan bahwa suatu pola berarti kecurangan, hanya menampilkan pola tersebut sebagai angka.
> 3. **Dengan menyetujui kesepakatan di SAKSI, kedua pihak menyetujui bahwa riwayat kesepakatan mereka — baik yang selesai maupun yang tidak — dapat ditampilkan sebagai bagian dari riwayat lengkap rekening atau nomor HP yang digunakan, sebagaimana dijelaskan di atas.** Persetujuan ini adalah dasar hukum pemrosesan dan publikasi tersebut, dicatat beserta versi dokumen ini pada saat Anda menyetujuinya, dan berlaku terpisah dari persetujuan Bagian 4 mengenai catatan tidak terpenuhi.

This is a draft for your review, not final legal language — flagging the mirrored-consent-clause structure (paragraph 3 modeled directly on §4.6's existing pattern) as the main design choice worth confirming, since the actual wording carries real weight once it's the thing a user is asked to agree to.

### Schema — no migration needed

Every signal and every ledger field is a read-time aggregation over `deals`, `deal_events`, `parties`, `flags` as they exist today — no new columns, no new tables, for either the read side (ledger + signals 1–4) or the write-side guard (signal 5's `COUNT` check). This is worth stating plainly rather than defaulting to "add a table": the two prior design passes in this file (PERPANJANGAN, two-leg loan) both needed real schema changes; this one doesn't, and inventing a precomputed/cached table here would just be a second source of truth for data `deal_events` already holds — the same "materialized state is a cache of events, never a source of truth" principle migration 0007 already established.

### Gating — three, not two

GATE 1 (lawyer review) and the T&C gap above both apply, same reasoning as the breach pipeline plus the new §4A. GATE 2 (PSE Kominfo / no-discovery-surface) doesn't apply in its usual noindex/no-links form since there's no new route (see Entry-point section), but the *substance* of Option A — don't make more of the corpus casually browsable before PSE clears — still argues for keeping this behind the same `FLAGS_PUBLICATION_ENABLED`-style feature flag as the breach pipeline, gating the "Lihat detail lengkap" button's very existence rather than trusting "it's technically not a new URL" to carry the whole argument on its own. Proposed new flag name: `LEDGER_DETAIL_ENABLED`, same off-by-default/explicit-opt-in shape as `FLAGS_PUBLICATION_ENABLED`.

## Breach → flag pipeline

1. Deadline lapses in an eligible state → SYSTEM event `TENGGAT_LEWAT`.
2. Reporter (the unpaid/undelivered party) files breach. **Filing is free at every tier.**
   ~~Requires reporter OTP (we pay ~Rp430) — every flag has a traceable reporter~~ —
   **removed 2026-07-21 (copy-id.md §25).** The OTP step sat on the WhatsApp
   channel, so a Fonnte outage blocked the wronged party's only recourse: the
   one failure mode this pipeline cannot tolerate. Identity is now
   `identifyPartyByPhone` only — proves the filer is a party to this deal, not
   that they currently possess the number. `BARANG_TIDAK_SESUAI_CONSEQUENCES`'
   last bullet was corrected to stop claiming phone verification and instead
   names what's actually true: a false report stays permanently on the record,
   attributed to that party. Do not reintroduce this OTP step without reading
   §25 first — it documents exactly why it was removed.
3. Notification to the other party (WA utility template) opens the 14-day hak jawab window.
4. Window closes silent → flag publishes. Rung selection: bukti confirmed by counterpart earlier? rung 1 : rung 0. (Rung 2 reserved for open-banking roadmap.)
5. Flag lands on identifiers by tier: GRATIS → rekening (masked) + bank; LIMA_RIBU → + phone_hash; BERMETERAI → + verified-identity marker (never the NIK itself).

## Tier spec (locked)

| | GRATIS | LIMA_RIBU (Rp5.000/pihak) | BERMETERAI (Rp50.000/pihak) |
|---|---|---|---|
| Verifies | nothing about the person | both phones (WA OTP) | legal identity (Didit e-KYC) + phones |
| Payment | — | Midtrans **QRIS only** | QRIS preferred, VA allowed |
| Extra artifacts | — | — | e-meterai (mock in demo) + evidence-pack PDF |
| Everything else | identical: record, hash+OTS, all states, free breach filing, hak jawab, flag, check page, N8 warning | ← | ← |

Fee charged at DISEPAKATI, non-refundable, either party may pay for both (recorded — a seller paying both sides is a good-faith signal). Verification cannot be delegated: money can be paid by one party; OTP/e-KYC cannot.

## Profile page (public, per phone_hash or rekening)

Counts per outcome, never a score: selesai · dibatalkan bersama · tidak dilanjutkan (HnR) · kedaluwarsa · dikembalikan penuh · dikembalikan sebagian · tidak dipenuhi · klaim berbeda aktif. Plus account age and verification level. Rendering a composite score, stars, or a safety color is FORBIDDEN — a score is a verdict wearing math.
