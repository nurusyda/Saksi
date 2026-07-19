# SAKSI — Tier A Completion Plan

Living document. Check off phases as they land. Mirrors the discipline already in
place: locked copy from `copy-id.md` verbatim, manual review for anything touching
schema/state-machine/copy, `monster_check.py` before every commit, diffs shown
before applying.

---

## Status snapshot

**Done and committed:** exit-state rename batch (TIDAK_DILANJUTKAN, KEDALUWARSA,
DIKEMBALIKAN_SEBAGIAN). Slice 2 *backend* — migrations 0007/0008,
`record_party_acceptance`/`finalize_deal_acceptance` RPCs,
`PROPOSER_ACCEPTED`/`COUNTERPART_ACCEPTED`/`ACCEPTED` events, T&C version+hash now
captured at `CREATED`/`COUNTERPART_JOINED`. Phase 0 (all 8 items below). A PII RLS
gap present since the initial schema was found and closed along the way (migration
0009 — `deals`/`parties` no longer directly readable by anon/authenticated, only
through the masked `deals_public`/`parties_public` views). Unused PERPANJANGAN
state-machine wiring removed (never had a real procedure behind it — see the
ROADMAP entry under Tier A+). Deadline-sweep plan fully reviewed and locked (not
yet built). Gemini API key live in env (local + Vercel).

**Not done:** Phase 1's frontend (the accept screen itself — backend is ready),
the real gated forced-check page, bukti upload + OCR, SELESAI, the sweep's actual
code, per-deal-type confirmation labels wired in.

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

## Phase 1 — Slice 2 frontend: the accept screen

- [ ] Phone verification gate (reuse JOIN_FORM_HEADING/JOIN_DEAL_INSTRUCTION)
- [ ] Wire `record_party_acceptance` + `finalize_deal_acceptance`
- [ ] Already-accepted / wrong-phone read states
- [ ] DISEPAKATI placeholder line

## Phase 2 — Backup + keepalive GitHub Action

- [ ] Audit whether `.github/workflows/backup.yml` already exists/works
- [ ] Confirm it actually runs (check Actions tab, not just the YAML)

## Phase 3 — Real forced-check page (gated)

- [ ] Reuse Phase 0.5's shared query function, now gated
- [ ] Copy-rekening button disabled until history card renders
- [ ] Empty state never softened (copy-id.md §2)

## Phase 4 — Bukti upload + Gemini OCR

- [ ] Blocking attestation checkbox before upload
- [ ] Gemini consistency check, mapped to KONSISTEN/TIDAK_KONSISTEN/TIDAK_TERBACA
- [ ] Storage bucket + RLS policy confirmed

## Phase 5 — DIKONFIRMASI_TERIMA → SELESAI

- [ ] Receipt-confirmation step using locked per-deal-type confirmation labels

## Phase 6 — Deadline sweep, built to the already-approved plan

- [ ] Candidate query, decision tree, Vercel Cron config, CRON_SECRET auth
- [ ] Migration for NUDGE_SENT event
- [ ] `lib/wa/send.ts` interface stub (not the real Fonnte/Meta client)

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
