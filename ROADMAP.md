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

## Tier A+

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

## When a paying use case demands it

### Dukcapil-backed e-KYC swap
- **What it is:** Replace/augment Didit with a Dukcapil-connected e-KYC
  vendor (Verihubs/VIDA/Privy).
- **Why deferred:** Didit is not a Dukcapil check; current e-KYC is
  sufficient for the Bermeterai tier's needs.
- **Target:** When a paying use case demands it.
