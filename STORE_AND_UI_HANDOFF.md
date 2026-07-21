# SAKSI — Store Layer, Pricing, WA/Sheets, Meterai & UI — Implementation Handoff

**Audience:** an engineer / Claude Code instance implementing the next phase.
**Read first (non-negotiable):** `CLAUDE.md`, then every file under
`.claude/skills/saksi-builder/references/` — especially `data-model.md`
(schema, state machine, tier spec, breach logic) and `copy-id.md` (locked
Indonesian strings). These hold LOCKED decisions. Do not improvise states,
tiers, wording, or stack choices. Where this doc proposes changing a locked
decision, it is flagged **DECISION NEEDED** — the human resolves it and updates
the reference docs first; you do not invent the answer.

**The one invariant (never violate):** every string SAKSI shows must be true
even when a user is lying to it. No scores, no "aman", no "terpercaya", OCR says
"konsisten" never "asli", absence never reassures. When torn between a stronger
claim and a weaker true one, ship the weaker true one.

**Stack (locked):** Next.js App Router + TS + Tailwind v4 on Vercel · Supabase
(Postgres/RLS/Storage, ap-southeast-1) · **identity = phone, no accounts /
emails / passwords** · SHA-256 + OpenTimestamps on every state transition ·
Gemini OCR · Midtrans Snap · Didit e-KYC.

---

## 0. Why a branch (answering the standing question)

Vercel auto-deploys `main` to production. The Store work below spans multiple
migrations + modules over days; building it directly on `main` risks deploying a
half-finished, broken site on every intermediate commit. So:

- **Big Store / pricing / meterai work → feature branch** (`seller-store`),
  merge to `main` only when the feature is whole and deployable.
- **Small, safe, self-contained fixes** (e.g. the font fix already applied to
  `app/globals.css`) → fine to commit straight to `main`.

If SAKSI has no live audience yet, working on `main` is *survivable* — but the
moment there's anything real in production, the branch is what keeps the live
site stable while you build. Default to the branch for this phase.

```bash
git checkout -b seller-store
```

---

## 1. UI — what's wrong and how to finish it

### 1a. DONE — the root cause (font override)
`app/globals.css` hardcoded `font-family: Arial, Helvetica, sans-serif` on
`body`, overriding the Geist font `layout.tsx` loads. **Already fixed** — body
now uses `var(--font-geist-sans)`. This alone removes most of the "unnatural"
feeling. Verify Geist actually renders (DevTools → Computed → font-family).

### 1b. Remaining polish (do after the font, in order of impact)
The app is raw utility-Tailwind with no shared rhythm. Tighten these:

1. **A max-width container standard.** Pages use `max-w-sm` (384px) which reads
   as cramped/toy-like for anything beyond the landing CTA. Adopt a consistent
   content width: `max-w-md` (28rem) for forms, `max-w-lg`/`max-w-xl` for
   record/ledger pages. Centralize in the layout or a `<Container>` component so
   every page shares it.
2. **A vertical rhythm scale.** Standardize section spacing (`gap-6`/`gap-8`,
   `py-8` page padding) instead of ad-hoc values per page.
3. **Input + button consistency.** Define one input style (height, border,
   radius, focus ring) and one button style, reused everywhere — right now each
   form hand-rolls them. Ensure every interactive element has a visible
   `focus-visible` ring (accessibility + "feels finished").
4. **Type scale.** Body `text-base`/`leading-relaxed`, headings a clear step up
   (`text-2xl`/`text-3xl font-semibold tracking-tight`). Avoid `text-sm` for
   primary body copy — small default text is part of the "cheap" feel.
5. **Color:** the zinc-on-white palette is fine (user said color isn't the
   issue). Keep it; do NOT introduce brand colors that could read as a trust
   signal. Neutrality is on-brand.
6. **Load the dataviz/artifact-design skill mindset only if adding charts** —
   none needed yet.

Do **not** add a UI framework or component library — keep it Tailwind + small
local components. The problem was never missing libraries; it was the font.

---

## 2. Pricing reconciliation — **DECISION NEEDED before Store**

The built tier spec (`data-model.md` "Tier spec (locked)") is **per-party,
per-deal**: `GRATIS` / `LIMA_RIBU` (Rp5.000/pihak) / `BERMETERAI`
(Rp50.000/pihak). The newer product model from strategy work is:

- **Free loop** (link + OCR + record) — genuinely free, to maximize logged
  deals (data + adoption).
- **Saksi Store** — **Rp100.000 one-time per seller** (persistent profile:
  saved rekening/QRIS, reusable link, bulk, verified-rekening marker, factual
  record display). This is a **new charge dimension** (per-seller, not per-deal).
- **Saksi Resmi (meterai)** — **buyer-initiated, ~Rp30.000 per deal**, replacing
  the per-party `BERMETERAI` framing.

**The tension:** charging Rp5.000 on every deal (`LIMA_RIBU`) adds friction to
the exact behavior (logging deals) the free loop needs to maximize.

**DECISION NEEDED (human):**
- (a) Keep the loop **free**, fold `LIMA_RIBU`'s value (phone_hash on flags,
  OTP) into either free or the Store, and move monetization to Store (one-time)
  + meterai (per serious deal)? **[recommended]** — or
- (b) Keep per-deal micro-fees and add Store on top?

Whichever is chosen, **update `data-model.md` Tier spec + `copy-id.md` tier
strings first**, then migrate. Do not ship a pricing model that contradicts the
locked docs. Everything in §3–§6 assumes (a) unless told otherwise.

---

## 3. Saksi Store — additive migration (respects "no accounts")

The build is per-deal and stateless (phone identity, per-token deals). The Store
adds a **persistent seller profile keyed to `phone_hash`** — claimed and managed
via **OTP only** (no email/password), so it does NOT violate the locked
"identity = phone, no accounts" rule.

New migration (additive — existing tables untouched):

```sql
-- supabase/migrations/00XX_seller_profiles.sql
create table seller_profiles (
  id uuid primary key default gen_random_uuid(),
  phone_hash text unique not null references parties(phone_hash),
  slug text unique not null,                 -- saksi.id/toko/<slug>
  display_name text not null,                -- store name (user-set, shown verbatim)
  saved_rekening text,                       -- masked in public views
  saved_bank text,
  saved_qris_nmid text,                      -- parsed client-side from QRIS payload
  store_verified_at timestamptz,             -- set when rekening control proven (penny-test/name-match)
  paid_at timestamptz,                       -- Store one-time fee paid (Midtrans)
  created_at timestamptz default now()
);
-- RLS: public read of NON-sensitive columns only (slug, display_name,
-- store_verified_at); saved_rekening/qris exposed only where a deal already
-- exposes them per the existing tier/masking rules. Manage-writes gated by
-- OTP-verified phone_hash session (reuse lib/db/partySession.ts).
```

**Invariant compliance for the Store badge:** the public store page may show
ONLY true facts — `store_verified_at` (a verified-rekening-control marker, NOT
"terpercaya"), and the SAME 8-bucket factual counts the existing profile page
already renders (reuse `lib/db/accountHistory.ts`). **No score, no "terpercaya",
no "aman", absence never reassures.** A paid-but-empty store shows an empty
record — paying never fabricates trust.

---

## 4. Saksi Store — module, flow, link-substitution

The adoption thesis: the seller sends a **Saksi link instead of a bare
rekening** at "kak aku mau bayar." Build:

- `app/toko/[slug]/page.tsx` — public store page (factual record + verified
  marker + a "start a deal with this store" entry that pre-fills the seller's
  saved rekening/QRIS into the existing `createDeal` flow).
- `app/toko/kelola/*` — OTP-gated management (set display_name, slug, saved
  rekening/QRIS, run rekening-control verification).
- `lib/store/*` — profile read/write, slug generation (nanoid or slugified
  name), QRIS NMID parse (EMVCo TLV, client-side, no BI API).
- **Reuse, don't fork, the deal engine:** a Store-originated deal is a normal
  `deals` row with `rekening_tujuan` pre-filled from the profile. The state
  machine, event log, anchoring, OCR — all unchanged.
- **Bulk / PO mode** (Store-only): generate many deal links against the saved
  profile + a paid-vs-unpaid board reading existing `deals.status`. No new state
  machine; it's a view over existing rows.

Store one-time fee: Midtrans Snap, set `seller_profiles.paid_at`. Gate bulk +
verified marker + custom slug behind `paid_at`.

---

## 5. WA send + Google Sheets sync (free-tier stickiness)

- **WA send:** `wa.me/?text=` deep link with pre-filled message containing the
  deal link. Free, no WhatsApp Business API (avoid per-conversation fees). Add a
  "Kirim via WhatsApp" button on the deal-created screen.
- **Sheets sync (one-way first):** on each terminal deal state, append a row to
  the seller's Google Sheet (Google Sheets API, seller connects via OAuth in
  `app/toko/kelola`). Columns: buyer phone_hash (masked), item, amount, status,
  bukti link, timestamps. Two-way sync is a later, separate piece — do one-way.
- Both are additive; neither touches the ledger core.

---

## 6. Buyer-initiated meterai (rework of BERMETERAI)

Current `BERMETERAI` is a per-party tier chosen at join. Rework to
**buyer-initiated on the completed record**:

- On a deal reaching a terminal confirmed state, the **buyer** may tap "Tambah
  meterai" and pay (~Rp30.000, Midtrans).
- Affix e-meterai (via a licensed distributor API — Mekari Sign / Privy; see
  `integrations.md`) to a generated **completed-transaction document** (kwitansi
  capturing item, amount, rekening, timestamps, and the bukti), NOT a blank
  invoice.
- Copy must be accurate: **"dokumen bermeterai — siap jadi alat bukti"**, never
  "sah secara hukum" / "dijamin". Meterai = evidentiary readiness, not contract
  validity. (Add strings to `copy-id.md` — DECISION NEEDED on exact wording.)
- **Margin check:** meterai face Rp10.000 + distributor + e-sign fee. Verify the
  vendor's real per-stamp cost before committing to a Rp30.000 price.
- Requires a **meterai prepaid float** (working capital for pre-bought stamps) —
  ops concern, not code.

---

## 7. Leave gated / deprioritize

- `pinjam-meminjam` (two-leg loan-witnessing) — designed, gated off. **Keep
  gated.** It is NOT the credit business; the credit play is *referring sellers
  to licensed lenders using income data*, a separate future layer fed by
  `accountHistory` — do not build loan-witnessing now.
- `sewa-menyewa` (kos/rent) — keep, but not the beachhead; deprioritize.

---

## 8. Discipline (from ops.md — do not skip)

- All schema changes via Supabase CLI migrations, committed. No dashboard edits.
- Keep the daily `supabase db dump` GitHub Action (backup + keepalive) green.
- Anchoring (SHA-256 + OpenTimestamps) fires on every NEW state transition —
  any new transition you add must anchor too.
- UI strings come from `copy-id.md`. New strings get added there first, verbatim,
  after human sign-off — do not inline Indonesian copy in components.

---

## 9. Suggested execution order

1. `git checkout -b seller-store`.
2. **Resolve §2 pricing DECISION** with the human; update `data-model.md` +
   `copy-id.md`.
3. Finish UI polish §1b (container, spacing, input/button, type scale).
4. Store migration §3 (additive).
5. Store module + link-substitution §4 (reuse deal engine).
6. WA send + one-way Sheets §5.
7. Buyer-initiated meterai §6.
8. Merge to `main` when whole and deployable.

Leave the ledger core, the state machine, the anchoring, and the invariant
untouched throughout. This is an extension, not a rewrite.
