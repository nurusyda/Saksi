# ROADMAP

Deferred work, tracked so it isn't lost. Each entry: what it is, why it's
deferred, and the milestone it's tied to.

## Tier A - polish

### Proposer/counterpart role auto-display on deal page
- **What it is:** The deal page doesn't automatically display which party is
  the proposer and which is the counterpart based on their roles.
- **Why deferred:** Cosmetic gap only; doesn't block any state transition or
  data integrity.
- **Target:** Tier A polish pass.

### Full switchable guided-template system for deal descriptions
- **What it is:** Replace the current single textarea + role-based placeholder
  text (Phase 0.3) with a real Typeform/Google-Forms-style system: separate
  structured fields per deal type (jual-beli, pinjam-meminjam, sewa-menyewa),
  not just smarter placeholder copy in one shared box.
- **Why deferred:** Placeholder-text switching solves the immediate clarity
  gap cheaply; structured per-type fields touch the create form, validation,
  and the canonical hash payload shape — a bigger, separate piece of work.
- **Target:** Tier A polish pass.

## Tier A+

### PERPANJANGAN (deadline extension) — design the procedure, then rebuild
- **What it is:** Letting either party propose a new deadline and the
  counterpart accept it, from DISEPAKATI/DIBAYAR_DIKLAIM/DIKONFIRMASI_TERIMA,
  per `data-model.md`'s Extension section. State-machine wiring for this
  existed in `lib/db/transitions.ts` (PERPANJANGAN_PROPOSED/PERPANJANGAN_ACCEPTED
  events) but was removed — it was written before the actual procedure was
  thought through (how many extensions are allowed, what happens to an
  in-flight breach timer, whether one party can unilaterally extend past a
  point, how it interacts with the daily deadline sweep) and had never been
  wired to any UI or Server Action.
- **Why deferred:** Important enough that it shouldn't be re-added piecemeal
  the way it first went in. Needs a real design pass — same discipline as any
  other schema/state-machine change — before touching code again.
- **Target:** Tier A+. `data-model.md`/`copy-id.md` still describe it as
  locked spec (the Extension section, and the PERPANJANGAN record line in §7)
  even though the code no longer implements it — worth a look when this gets
  designed, to confirm the existing spec still holds or needs revising too.

### Two-leg loan model (pencairan + pengembalian)
- **What it is:** Split loan agreements into two separate legs (disbursement
  and repayment) instead of one.
- **Why deferred:** Current schema only records the repayment leg. Splitting
  it touches the state machine and migrations.
- **Target:** Tier A+, when loan volume appears.

## Tier B - scale hardening

### Rate-limit TOCTOU hardening
- **What it is:** `app/buat/actions.ts` has a known check-then-act race in
  the daily deal-creation rate limit (20/party/UTC day): two concurrent
  requests can both pass the count check before either insert lands.
- **Why deferred:** Low blast radius (worst case: a party briefly exceeds
  the daily cap by a couple of deals).
- **Target:** Tier B / scale hardening pass.

## Tier C - paid launch

### Real e-Meterai Peruri distributor integration
- **What it is:** Swap the mocked e-Meterai stamping for a real
  Peruri-authorized distributor integration.
- **Why deferred:** Requires a commercial integration and paid-tier billing
  plumbing to be live first.
- **Target:** Tier C (paid launch).

### Vercel Hobby cron reliability for the deadline sweep
- **What it is:** Hobby-tier scheduled cron jobs aren't guaranteed to fire at
  the exact scheduled time, and can be delayed or occasionally skipped under
  load, unlike Pro. The deadline sweep's own day-count logic tolerates late
  runs fine (nudge/TENGGAT_LEWAT/KEDALUWARSA_LAPSED windows are multi-day, not
  minute-precise). The real risk is a fully skipped run — since the sweep is
  stateless per invocation rather than queued, a skipped day isn't
  automatically caught up, just picked up whenever the next run happens.
- **Why deferred:** Acceptable for now since the free tier has no payment on
  the line yet.
- **Target:** Tier C (paid launch) — already a required upgrade (see the
  existing Vercel Hobby→Pro note in `ops.md`); worth confirming at that point
  whether Pro's cron reliability is sufficient on its own, or whether the
  sweep needs a "did yesterday's run actually complete" self-check as a
  safety net.

## Post-launch

### Open-banking mutasi verification (flag rung 2)
- **What it is:** Rung 2 of the flag evidence tiers, verifying account
  mutations via open banking.
- **Why deferred:** Requires a Brick/Ayoconnect integration; not needed for
  rung 0/1 to function.
- **Target:** Post-launch, corpus-density roadmap.

### B2B risk-check API
- **What it is:** An API for businesses to query SAKSI's record corpus for
  risk-checking counterparties.
- **Why deferred:** Only useful once there's enough recorded history to be
  worth querying.
- **Target:** Gated on corpus-density milestone (~50-100rb identifiers).

### Full transaction ledger view + reputation-gaming detection (rekening/phone drill-down)
- **What it is:** A "Lihat detail lengkap" link under the aggregate count
  line in the existing account-history check (Phase 0.5's ungated card on
  `/buat`, and Phase 3's gated forced-check card in the payment flow — both
  backed by `lib/db/accountHistory.ts`'s `getAccountHistory()`) that opens
  the full ledger for that rekening: every deal it has ever been the
  destination account for, which were disputed (`TIDAK_DIPENUHI`/`SENGKETA`)
  vs completed (`SELESAI`) vs other exit states, and every phone number that
  has used that rekening across different deals (cross-identifier linkage,
  not just a single phone-to-rekening pair). Later addition, explicitly
  separate scope: detection for patterns suggesting the ledger itself has
  been gamed — e.g. a small closed loop of phone_hashes repeatedly trading
  `SELESAI` outcomes with each other in a short window to manufacture a
  clean-looking record, mirroring the "seller ships empty box to a fake
  buyer account who leaves a good review" pattern already documented in
  Indonesian e-commerce fraud research.
- **Not a standalone lookup tool:** only reachable by clicking through from
  an account-history check that's already showing that specific rekening —
  never a public search-by-rekening/phone entry point on its own. Matches
  the Phase 0.2 decision to remove the homepage search bar and the
  product's "trust first" positioning.
- **Entry-point UX — resolved 2026-07-20:** a single "Lihat detail lengkap"
  link/small button below the count line, not the individual numbers made
  clickable. Numbers-as-links would mean several different pieces of text
  all pointing to the same destination (confusing — why would "5 selesai"
  and "3 tidak dipenuhi" lead to the same page?) and isn't a self-evident
  affordance to every visitor. One explicit link is clearer and matches the
  plain, restrained tone the rest of the copy already has. Exact string is
  a suggestion, not locked — low-stakes UI chrome, same category as other
  strings approved inline in Session 3, not legal-adjacent like copy-id.md's
  numbered sections.
- **Content principle — resolved 2026-07-20, "no bumbu":** the ledger shows
  only what actually happened — raw counts, raw per-deal facts (status,
  date, the other linked identifiers) — never SAKSI's own interpretation,
  framing, or spin on what a pattern means. This is the same invariant
  SKILL.md already states for the whole product ("every string SAKSI shows
  must be true... claims are attributed to claimants") applied specifically
  to this feature: no added commentary, no "ini mencurigakan," just facts.
  Gaming-detection signals (below) are surfaced as raw numbers under this
  same rule (e.g. "5 dari 5 kesepakatan selesai dengan pihak yang sama"),
  never as a verdict SAKSI renders about the person.
- **T&C gap — resolved 2026-07-20, action needed before shipping:**
  `content/legal/syarat-ketentuan.md` §4 is titled and scoped specifically
  to publishing *unfulfilled* agreements. It does not yet authorize
  publishing full ledger detail — `SELESAI` records and phone-to-rekening
  cross-linkage are both new kinds of disclosure this feature introduces.
  Needs an explicit clause (extend §4 or add a new section) stating the
  full ledger, not just breach records, is publicly viewable — otherwise a
  user could reasonably argue they consented to "bad stuff becomes visible
  if I don't pay," not "everything I've ever done here is visible to any
  stranger." Not drafted here — real T&C language needs the same care as
  every other locked string, not something to invent inline.
- **Goes beyond the current locked spec:** `data-model.md`'s "Profile page
  (public, per phone_hash or rekening)" section only specifies aggregate
  counts per outcome plus account age/verification level — never per-deal
  detail or cross-identifier linkage. Still needs an explicit decision on
  exactly which per-deal fields become visible (status + date confirmed in
  scope per "no bumbu" above; item_desc/amount-range/masked-counterpart
  still open) before implementation.
- **Reputation-gaming detection — resolved 2026-07-20, ideas locked in, not
  yet built.** "Wait for someone to file a report" is not sufficient on its
  own: reports only catch disputes, and wash-trading (two colluding phone
  numbers trading fake `SELESAI` outcomes with each other) has no unhappy
  party to ever file one — it's structurally invisible to a complaint-driven
  system. Five candidate signals, cheapest/most-defensible first, all
  computable from data already stored (no new integration):
  1. **Concentration ratio** — what fraction of a rekening's deals are with
     the same one or two counterpart phone_hashes vs. spread across distinct
     people. High concentration is the core wash-trading tell.
  2. **Velocity/timing** — real deals have friction (an actual bank transfer
     takes time, a package takes days). DISEPAKATI→SELESAI in minutes,
     repeated with the same pair, is a tell. Free to compute from existing
     `deal_events` timestamps.
  3. **Volume vs. account age** — 10+ `SELESAI` in a rekening's first two
     days reads differently than the same count over six months.
  4. **Show the raw pattern, don't auto-judge (recommended lead approach)**
     — matches the "no bumbu" rule above and the product's core "SAKSI is
     not a judge" stance (`syarat-ketentuan.md` §1). Surface concentration/
     velocity as plain facts in the ledger (e.g. "5 dari 5 kesepakatan
     selesai dengan pihak yang sama") and let the viewer draw their own
     conclusion, rather than SAKSI silently flagging or hiding accounts.
  5. **Rate-limit the pair, not just the phone** — extends the existing
     rate-limit idiom already used everywhere in this app (20 deals/day/
     phone_hash, 3 OTP/hour, etc.): cap how many deals the *same two*
     phone_hashes can complete with each other in a short window, as a
     circuit breaker rather than a judgment call.
  Explicitly **not in scope**: Rung 2 (open-banking mutasi verification,
  already tracked separately under Post-launch below) is the real structural
  fix — it's the only thing that checks whether money actually moved.
  Everything above is a stopgap for rung 0/1, which are already honest
  about being unverified claims (the flag ladder says "Belum diverifikasi
  bank"), not a replacement for real verification. Not building rung 2 yet.
- **Why deferred:** Raised mid-conversation (2026-07-20) while scoping the
  proposal's check/flag surfaces; founder wants this designed and built
  right after Tier B, not before — sequencing intentional, not a sign this
  is low-priority. As of this note, founder is on Tier B's task b6, close to
  done.
- **Target:** Immediately post-Tier B (scale hardening). Design pass first
  (remaining per-deal-field decision above, plus drafting the T&C addition),
  same discipline as any other schema/state-machine change, before code.

### Real bank account-holder name lookup
- **What it is:** Verify the actual registered name behind a rekening_tujuan
  via a vendor lookup (Xendit Name Validator, ~Rp300/hit, or Flip/OY!
  equivalents), shown alongside the account-history check.
- **Why deferred:** Per-call cost only makes sense once check-page usage
  volume justifies it; not wired for the Phase 0.5 informational check or the
  Phase 3 gated version.
- **Target:** Post-launch, once check-page traffic justifies the per-call
  cost.

## When a paying use case demands it

### Dukcapil-backed e-KYC swap
- **What it is:** Replace/augment Didit with a Dukcapil-connected e-KYC
  vendor (Verihubs/VIDA/Privy).
- **Why deferred:** Didit is not a Dukcapil check; current e-KYC is
  sufficient for the Bermeterai tier's needs.
- **Target:** When a paying use case demands it.

## Paid-tier features (Toko Saksi Pro — Rp200rb)

Context: the §45 trust redesign (fair-attribution history + literal state
names + images on both sides of every dispute) is built and live on the free
tier. The items below were surfaced while building it and deliberately deferred
to the paid tier. The no-scores invariant holds for all of them: any
"threshold" (e.g. "50 klaim berbeda raises an eyebrow") is a *human* read of
the raw counts SAKSI shows, never a hardcoded score or verdict SAKSI renders.

### Naughty-buyer visibility to sellers
- **What it is:** Let a seller check a *buyer's* phone before accepting a deal
  and see the buyer-side signals already computed in the ledger — chiefly
  `klaim pembayaran berbeda` (times a seller disputed this number's payment)
  and any pattern of one-sided/ghosted disputes. Today the fair-attribution
  model already attributes payment disputes to the buyer's phone
  (`accountHistory.ts` / `ledger.ts` phone mode); this feature is the seller-
  facing *surface* for it, gated to the paid tier.
- **Why deferred:** Founder call (2026-07-22) — the data model supports it now,
  but exposing buyer-side reputation to sellers is a paid-tier feature, and the
  surface needs its own design pass (what exactly a seller sees, how it stays
  attributed-not-adjudicated). "50 disputes raises an eyebrow" is illustrative
  of the human reading, not a number to encode.
- **Target:** Toko Saksi Pro (Rp200rb tier).

### Integrated spreadsheet export for sellers
- **What it is:** Give a seller a clean, structured export of all their SAKSI
  data — every deal, status, counterpart fingerprint, dates, amounts, dispute
  outcomes — accessible as a spreadsheet (CSV/XLSX download, and/or a live
  Google-Sheets-style connected view) so a high-volume seller can reconcile,
  do their own bookkeeping, and analyse their record outside the deal pages.
  Read-only projection of data the seller already owns; no new trust claims.
- **Why deferred:** A power-seller convenience feature, not core to the
  witnessing product; belongs to the paid tier alongside the shopfront
  (`saksi.app/namatoko`) and logo-on-tagihan features already stubbed in
  `TOKO_PRO_LOCKED_*` copy.
- **Target:** Toko Saksi Pro (Rp200rb tier). Design the export schema + column
  set first; reuse `lib/db/ledger.ts`'s aggregation rather than a new query
  path.

### Other paid-tier features (parking lot)
- Logo on tagihan + own shop link `saksi.app/namatoko` (already stubbed in
  `TOKO_PRO_LOCKED_TITLE`/`_PRICE`/`_DESC`).
- Any further seller analytics that are read-only projections of owned data and
  make no trust claim the free tier doesn't already earn — the rekam jejak
  itself stays free and un-buyable (T&C §7).

## Correctness refinements (post-launch)

### /cek phone lookup — per-role attribution
- **What it is:** The `/cek` phone lookup (`getAccountHistoryByPhoneHash`,
  `formatAccountHistoryFull`) currently pools a number's seller-role and
  buyer-role deals into one set of buckets. Each bucket label is individually
  true of the number, but a buyer in a seller-ghosted deal still sees
  "belum dikonfirmasi penjual" on their own lookup — imprecise, not false.
  The fix: split the phone view by the number's role per deal so each bucket
  reflects only that number's own conduct.
- **Why deferred:** Founder call (2026-07-22) — rides with the naughty-buyer
  paid-tier work above, which is where per-role attribution actually gets
  surfaced. Not false today, only pooled, so no free-tier urgency.
- **Target:** Alongside the naughty-buyer visibility feature.
