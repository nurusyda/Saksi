# SAKSI — Tier A Completion Plan

Living document. Check off phases as they land. Mirrors the discipline already in
place: locked copy from `copy-id.md` verbatim, manual review for anything touching
schema/state-machine/copy, `monster_check.py` before every commit, diffs shown
before applying.

---

## Status snapshot

**Done and committed:** exit-state rename batch (TIDAK_DILANJUTKAN, KEDALUWARSA,
DIKEMBALIKAN_SEBAGIAN). Slice 2 backend *and* frontend (Phase 1) — the accept
screen, forced-check page (Phase 3), bukti upload + Gemini OCR (Phase 4), and
DIKONFIRMASI_TERIMA → SELESAI (Phase 5) all shipped together in commit `0eadafb`
("Add Section C payment lifecycle..."), migrations 0007-0017. Phase 0 (all 8 items
below). Phase 2 verified working (Actions tab checked directly, not just the YAML —
green runs, `db-backups` branch present). A PII RLS gap present since the initial
schema was found and closed along the way (migration 0009 — `deals`/`parties` no
longer directly readable by anon/authenticated, only through the masked
`deals_public`/`parties_public` views). A second PII leak (full rekening serialized
into the client payload before phone verification) found and closed during Section
C's review — see migration 0017's `identify_attempts` rate limiting. Unused
PERPANJANGAN state-machine wiring removed (never had a real procedure behind it —
see the ROADMAP entry under Tier A+). Gemini API key live in env (local + Vercel).

**Correction:** the previous version of this doc said "Deadline-sweep plan fully
reviewed and locked (not yet built)" — that plan was never actually findable in any
committed file (checked `ROADMAP.md`, `SESSION_LOG.md`, `data-model.md`) when Phase
6 work started; it only existed in an earlier conversation. The decision tree below
was reconstructed and re-confirmed directly before Phase 6 was built.

**Not done:** per-deal-type confirmation labels beyond jual-beli
(pinjam-meminjam/sewa-menyewa aren't selectable yet — Section B gating);
pinjam-meminjam's nudge targeting (flagged, not designed, see Phase 6 below).

**Phase 6 update (2026-07-20, later session):** WA nudge copy is locked
(`copy-id.md` §9a) and `lib/wa/send.ts` is a real Fonnte client, not a stub —
both landed same-day as the items above. Separately, migration `0018`'s 4
sweep functions (`get_nudge_candidates`, `get_kedaluwarsa_candidates`,
`sweep_nudge_with_event`, `sweep_kedaluwarsa_with_event`) turned out to be
missing their `service_role` EXECUTE grant — this Supabase project runs under
the new cloud default where new functions aren't auto-exposed to any Data API
role without an explicit GRANT, so even the cron route's service-role client
got `42501`. Fixed via migration `0019` (grant to `service_role` only; `anon`
stays revoked, matching `0018`'s own boundary) and verified with a direct RPC
probe against both keys.

---

## Phase 0 — UI copy batch ✅ done, committed (`54cdceb`)

- [x] 0.1 Landing tagline → "Percaya itu baik. Tercatat lebih baik."
- [x] 0.2 Remove homepage search bar ("Cek rekening atau nomor HP (segera hadir)")
- [x] 0.3 Description field role-based placeholders
- [x] 0.4 Bank field → dropdown of standard Indonesian bank names
- [x] 0.5 Live (ungated) account-history check on create-deal form, shared query fn
- [x] 0.6 Tier cards: heading rename, remove paid-tier radios, add "notify me" checkboxes
- [x] 0.7 Attestation checkboxes 1-4 tightened wording (5 unchanged)
- [x] 0.8 Wanprestasi term — audited, decided to keep as-is (never previously
      reconsidered; standard correct legal term)

## Phase 1 — Slice 2 frontend: the accept screen ✅ done, committed (`0eadafb`)

- [x] Phone verification gate (reuse JOIN_FORM_HEADING/JOIN_DEAL_INSTRUCTION)
- [x] Wire `record_party_acceptance` + `finalize_deal_acceptance`
- [x] Already-accepted / wrong-phone read states
- [x] DISEPAKATI placeholder line — superseded by the real `DisepakatiPanel` (Phase 3+)

## Phase 2 — Backup + keepalive GitHub Action ✅ done, verified

- [x] Audit whether `.github/workflows/backup.yml` already exists/works
- [x] Confirm it actually runs (Actions tab checked directly — green runs,
      `db-backups` branch present on origin)

## Phase 3 — Real forced-check page (gated) ✅ done, committed (`0eadafb`)

- [x] Reuse Phase 0.5's shared query function, now gated (`getDealAccountHistory`,
      `app/deal/[token]/paymentActions.ts`)
- [x] Copy-rekening button disabled until history card renders — includes a
      fix found in review: the button no longer treats a lookup *error* as
      "resolved" (that was a real bypass of the guard)
- [x] Empty state never softened (copy-id.md §2)

## Phase 4 — Bukti upload + Gemini OCR ✅ done, committed (`0eadafb`)

- [x] Blocking attestation checkbox before upload
- [x] Gemini consistency check, mapped to KONSISTEN/TIDAK_KONSISTEN/TIDAK_TERBACA
      (`lib/ocr/gemini.ts` — verdict computed in code, never delegated to the model)
- [x] Storage bucket + RLS policy confirmed (migration 0014, private, service-role only)

## Phase 5 — DIKONFIRMASI_TERIMA → SELESAI ✅ done, committed (`0eadafb`)

- [x] Receipt-confirmation step using locked per-deal-type confirmation labels
      (jual-beli only — other deal types aren't selectable yet, Section B gating)

## Phase 6 — Deadline sweep

- [x] Candidate query, decision tree, Vercel Cron config, CRON_SECRET auth —
      decision tree reconstructed 2026-07-20, then corrected same day:
      TENGGAT_LEWAT was removed from the sweep entirely (verified against
      content/legal/syarat-ketentuan.md §4.1 — reporting is optional,
      "dapat mengajukan laporan," never automatic; TENGGAT_LEWAT can only
      fire as a side effect of an actual filed report, for either
      DIBAYAR_DIKLAIM or DIKONFIRMASI_TERIMA). Final design: two branches —
      nudge (T+2, targets exactly one party per state, opposite slots for
      DIBAYAR_DIKLAIM vs DIKONFIRMASI_TERIMA, jual-beli only) and a unified
      KEDALUWARSA_LAPSED (30 days past deadline, no report ever filed,
      reachable from either state). See migration 0018's header comment.
- [x] Migration for NUDGE_SENT event (migration 0018 + `lib/db/transitions.ts`)
- [x] `lib/wa/send.ts` — real Fonnte HTTP client, not a stub (`FONNTE_API_KEY`
      live in env; see ops.md)
- [x] `CRON_SECRET` generated and set in `.env.local` + Vercel project settings
- [x] WA nudge message copy locked into `copy-id.md` §9a
- [x] Migration `0019` — grants `service_role` EXECUTE on 0018's 4 functions,
      closing a gap where even the cron route's service-role client got
      `42501` (new-project Data API default doesn't auto-expose new
      functions). `anon`/`authenticated` deliberately stay revoked.
- [ ] Pinjam-meminjam's nudge targeting and its `DIKONFIRMASI_TERIMA`
      confirmation-label overlap with `RECEIPT_CONFIRMED` — flagged, not
      designed (see the comment above `nudgeTargetSlot` in
      `app/api/cron/deadline-sweep/route.ts`); deliberately left alone
      until pinjam-meminjam itself gets a real design pass

---

## Post-Tier-A roadmap (logged in ROADMAP.md)

- Full switchable guided-template system for deal descriptions
- Xendit/Flip/OY! bank account-holder name lookup
- Real Fonnte/Meta Cloud API WA client
- Rate-limit TOCTOU hardening
- Proposer/counterpart role auto-display
- Two-leg loan model (disbursement + repayment)
- Open-banking mutasi verification (flag rung 2)
- Real e-Meterai Peruri integration
- Dukcapil-backed e-KYC swap
- B2B risk-check API
- Vercel Hobby cron reliability (revisit at Pro upgrade)

---

## Order note

Phases 0-1-2 are the highest-value near-term work: they finish what's already
backend-complete (slice 2) and protect what already exists (backup). Phases 3-4-5-6
are the remaining happy-path + safety-net pieces. Do them in order — each one is a
real, reviewable, commit-sized chunk, same discipline as every phase before it.
