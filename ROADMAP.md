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
