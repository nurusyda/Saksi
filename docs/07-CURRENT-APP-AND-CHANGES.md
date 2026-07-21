# 07 — Current App State, Changes Applied, and Work Remaining

This is the document to read to **continue the build.** Read it alongside
`CLAUDE.md`, `STORE_AND_UI_HANDOFF.md`, and the LOCKED spec under
`.claude/skills/saksi-builder/references/` (`data-model.md`, `copy-id.md`,
`integrations.md`, `ops.md`).

## 1. What is already built (the hard core — keep it)

A mature Next.js (App Router) + TypeScript + Tailwind app on Vercel, Supabase
backend (Postgres + RLS + Storage, `ap-southeast-1`). Highlights:

- **Identity = phone, no accounts/emails/passwords.** Public clustering key =
  SHA-256(phone). Deal links are unguessable nanoid tokens.
- **Append-only `deal_events` witness log**; `deals.status` is a materialized cache.
  **SHA-256 + OpenTimestamps anchoring on every state transition.**
- **Full state machine** (28 migrations): `DRAF → DISEPAKATI → BUKTI_UPLOADED →
  DIBAYAR_DIKLAIM → DIKONFIRMASI_TERIMA → SELESAI` plus exit states (`KEDALUWARSA`,
  `DIBATALKAN_BERSAMA`, `TIDAK_DILANJUTKAN`, `TIDAK_DIPENUHI`,
  `DIKEMBALIKAN_PENUH/SEBAGIAN`) and a `PERPANJANGAN` (deadline-extension) design.
- **Gemini OCR** for bukti consistency ("konsisten", never "asli").
- **Midtrans** (payments), **Didit** (e-KYC, Bermeterai tier), **WA OTP**,
  **OpenTimestamps**, evidence-pack PDF.
- **Public surfaces:** check page, flag page, profile (8-bucket counts, **never a
  score**), breach pipeline with reporter OTP + 14-day hak jawab.
- **Account-history ledger + fraud signals** (velocity, concentration, pair
  rate-limiting) — the seed of the B2B fraud-data asset.
- **The one invariant** enforced throughout, and a `saksi-builder` skill holding
  the locked spec.

Designed-but-gated: `pinjam-meminjam` (two-leg loan-witnessing) and `sewa-menyewa`
(kos/rent). **Keep gated; deprioritize.** Note the loan-witnessing feature is NOT
the credit business (`06`) — that's a data→lender referral, a different thing.

## 2. What was ALREADY changed (the invoice reframe — done, on `main`, typecheck-clean)

The app was partially reframed from an abstract "Kesepakatan" tool into a
seller-first **invoice (tagihan)** tool. Changes applied:

1. **Font bug fixed** (`app/globals.css`): the body was hardcoded to
   `Arial, Helvetica` which overrode the loaded Geist font — the cause of the app
   "looking unnatural." Now uses `var(--font-geist-sans)`. *(This was THE UI
   problem; it was a bug, not taste.)*
2. **Landing page** (`app/page.tsx`) rebuilt as an invoice tool: heading "Buat
   tagihan buat pembeli kamu.", a 1-2-3 how-it-works, single **Buat Tagihan** CTA.
   **"Cek Rekening" CTA removed** per founder request.
3. **Create form** (`app/buat/page.tsx`) reframed:
   - Title → **Buat Tagihan**; invoice intro; section labels **Data kamu · Barang
     & harga · Rekening pembayaran kamu**; submit → **Buat Tagihan**.
   - **Penjual/Pembeli role selector REMOVED** — seller-first; `proposer_role` is a
     hidden `PENJUAL`. (Backend still supports PEMBELI-proposed deals; only the UI
     path is seller-only.)
   - **Tier selector + paid-interest signal REMOVED** — `tier` is a hidden
     `GRATIS`. (Consistent with pricing option (a); see `04` §7 — formal
     reconciliation still DECISION NEEDED.)
4. **tagihan vs kesepakatan boundary** codified as **`copy-id.md` §20.** The
   *create-and-send* surface (landing, create form, deal-link/share card, WA share
   text) uses **tagihan**; everything about the *witnessed agreement* (breach,
   flag, T&C, attestations, lifecycle log, notifications) stays **kesepakatan** —
   because that is what SAKSI legally records. **Do not sweep those to tagihan.**
5. **Front-door strings centralized in `lib/copy.ts`** (the invariant-audit
   surface): `LANDING_HEADING`, `LANDING_SUBHEAD`, `LANDING_STEPS`,
   `CTA_BUAT_TAGIHAN`, `BUAT_HEADING`, `BUAT_INTRO`, `BUAT_SECTION_*`; plus the
   share card reframed (`DEAL_LINK_CARD_HEADING = 'Link tagihan ini'`, save hint,
   and `DealLinkCard.tsx` WA text prefix `Tagihan SAKSI:`).

All of the above passes `npx tsc --noEmit` (exit 0).

## 3. Immediate pending work (finish the invoice form)

1. **Add a visible due-date field** to the create form. **This is the priority.**
   Currently every deal silently uses `getDefaultDeadlineWib()` — a default the
   seller never chose. This is not cosmetic: **the deadline drives the
   `KEDALUWARSA` / breach timeline**, so a silent default mis-fires on real deals (a
   30-day PO looks overdue; a same-day sale gets far too long). Wire a date input to
   the `deadline` the server action already expects; keep a sensible default but
   make it editable. Add the locked string to `copy-id.md` first.
2. **Optional reorder:** lead the form with **Barang & harga** (the invoice line),
   then **Rekening**, then **phone** — an invoice leads with the item + price. The
   4 attestation checkboxes + T&C **stay** (legal consent; do not remove).

## 4. Bigger pending work (in order)

1. **Resolve the pricing reconciliation** (`04` §7) — human decision, then update
   `data-model.md` + `copy-id.md`.
2. **Saksi Store layer** (see `STORE_AND_UI_HANDOFF.md` for the full spec): an
   additive `seller_profiles` migration keyed to `phone_hash` + OTP (respects "no
   accounts"), storing saved rekening/QRIS, slug, verified marker, `paid_at`. New
   modules `app/toko/[slug]` (public store) + `app/toko/kelola` (OTP-gated manage).
   Reuse the deal engine — a Store-originated deal is a normal `deals` row with
   `rekening_tujuan` pre-filled. Bulk/PO board is a view over existing `deals`.
   **The Store badge shows only true facts — never a score/"terpercaya".**
3. **WA-send** (`wa.me` link — already used on the share card; extend) + **one-way
   Google Sheets sync** (append each terminal deal to the seller's order sheet).
4. **Buyer-initiated meterai** rework (see `04` §3): buyer taps "Tambah meterai" on
   the completed record, pays ~Rp30k, e-meterai (Mekari/Privy) affixed to the
   *completed-transaction document*. Accurate wording only.
5. **Later phases:** B2B fraud-data product, then credit/lending referral (`06`).

## 5. Discipline & gotchas (do not skip)

- **All schema changes via Supabase CLI migrations, committed.** No dashboard edits.
  Keep the daily `supabase db dump` GitHub Action (backup + keepalive) green.
- **Every new state transition must anchor** (SHA-256 + OpenTimestamps).
- **Every user-facing Indonesian string comes from `copy-id.md`** verbatim; new
  strings are added there first (after human sign-off), then referenced from
  `lib/copy.ts`. Do not inline legal-adjacent copy.
- **The invariant overrides everything** — no scores, no "aman"/"terpercaya",
  absence never reassures, OCR "konsisten" not "asli".
- **Branch strategy:** Vercel auto-deploys `main` to production. Do big multi-day
  work (Store) on a feature branch; small safe fixes can go to `main`. (Pre-launch
  with no users, `main` is survivable but the branch protects a live site.)
- **WSL dev-server gotcha:** file-watching in WSL can silently miss changes, so
  `next dev` serves a stale build and edits "don't appear." Fix: stop the dev
  server, `rm -rf .next`, `npm run dev` again, hard-refresh (`Ctrl+Shift+R`). The
  code is fine; the running server was stale. (This bit the founder once —
  on-disk + `tsc` clean = the change is real.)

## 6. This is an extension, not a rewrite

The valuable core (event log, anchoring, state machine, integrations, the
invariant) is built and aligned with the strategy. **Do not start a new repo and do
not "break" the app.** The new work is additive (Store on top of the deal engine)
plus a couple of surgical reconciliations (pricing, meterai flow). Keep the domain,
keep the anchored data, extend on a branch.
