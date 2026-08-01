# 03 — Ledger Design & Legal Foundation

## 1. The one invariant (repeat)

Every string SAKSI shows must be **true even when a user is lying to it.** Claims
are attributed to claimants; **absence of records never reassures**; OCR says
"konsisten", never "asli"; **no scores, no "aman", no "terpercaya".** When torn
between a stronger claim and a weaker true one, ship the weaker true one. This is
the app's legal footing, not a style choice.

## 2. Events, not accusations (the core design principle)

The difference between SAKSI and a "penipu list" is a single discipline:

- **A reporting site logs accusations:** "this account is a penipu." An *opinion
  about a person* — free, unverifiable, poisonable, and legally an accusation (UU
  ITE exposure).
- **SAKSI logs events:** "Rp X moved to this rekening/QRIS at time T; the reporter
  disputes delivery," with the account holder's response recorded next to it. A
  *fact about money* — payment-anchored, timestamped, two-sided.

This buys two things a free-report site can't have: **legal cover** (facts + a
right of reply, never the word "penipu") and **signal quality** (a receipt costs
real money to fake, so the ledger doesn't drown in revenge-reports and farmed
noise).

Practically: the reader/aggregator *computes* concern from primitives (deadline
reached + no delivery-confirmation + no response); the ledger **never stores a
"BREACHED" or "PENIPU" verdict.** "Breach" and "penipu" exist only in the reader's
head.

## 3. The neutral event primitives

Store only what a party attests or a clock computes. The current app's state
machine already implements this (see `.claude/skills/saksi-builder/references/data-model.md`);
conceptually the primitives are:

- `DEAL_OPENED` — payment-anchored (bukti transfer). The anti-poisoning gate: you
  can't smear an account without proof real money went to it.
- `DELIVERY_OK` / fulfillment confirmed — the buyer's positive attestation
  (against their own interest → credible). The only *positive* event.
- `DEADLINE_REACHED` — computed from the clock, no signer.
- `DISPUTE_OPENED` / breach report — one party attests, with an evidence hash.
  **Corrected 2026-08-01 (supervisor audit):** this no longer requires OTP —
  removed from the breach-filing path 2026-07-21 (copy-id.md §25) because
  gating a wronged party's only recourse on a WhatsApp OTP delivery meant an
  outage could block a real complaint from ever being recorded. Identity is
  now `identifyPartyByPhone` (proves the filer is a party to this deal,
  re-derived server-side, but does NOT prove phone possession). Serial false
  accusers are still visible in the pattern — attribution is to "the phone
  number recorded as a party to this deal," not to a phone-possession-proven
  identity. Do not reintroduce OTP here without reading §25 first.
- `RESPONSE_FILED` — the counterpart's recorded reply (the hak jawab / right to
  respond, 14-day window).

## 4. Tamper-evidence (verifiable, not trustless)

- **SHA-256 of the canonical record JSON at every state transition**, chained
  (prior_hash → new_hash), stored in an append-only `deal_events` table. Never
  UPDATE state history — only INSERT events; `deals.status` is a materialized
  cache of the latest state, never a second source of truth.
- **OpenTimestamps** anchors each hash (free). This gives independent proof that a
  record existed at a time and hasn't been altered — *without* a blockchain holding
  personal data, and *while remaining deletable* (delete the off-chain record; the
  anchor becomes a harmless dangling hash → satisfies UU PDP erasure).
- **Evidence is anchored by hash, never published.** Bukti images live behind RLS
  in a private bucket; public pages render only derived data (masked identifiers
  like 0812••••34, counts, statuses, account age).

## 5. Anti-abuse (the real hard problem — Sybil/poisoning)

- **Payment-anchoring** — a dispute/open must reference a real transfer receipt.
  You can't poison an account for free.
- **Corroboration is the signal, not a single report** — one report is noise; N
  independent, payment-anchored reports against one NMID is a signal no honest
  seller produces. Thresholds gate whether a signal line renders; they never soften
  it into reassurance.
- **Rate limits from day one** — 20 record-creations/day per phone-hash,
  identity-check attempts capped at 10/15min per deal (`lib/db/party.ts`,
  post-§25 — no OTP send limit applies since OTP no longer exists on any
  path); a pair rate-limit circuit-breaker on repeated SELESAI between the
  same two phone-hashes (see data-model.md).
- **Right-to-respond** recorded — the defamation shield and the symmetry.
- **Personhood-lite** via phone identity, re-verified on every mutating
  action (`identifyPartyByPhone`); no accounts/emails/passwords, and no OTP
  either as of §25 — this proves party-to-deal membership, not phone
  possession.

## 6. The legal walls (all confirmed against Indonesian law)

### 6.1 UU ITE Art. 27(3) — defamation
Up to 4 years / Rp750M. Publishing a "penipu" accusation is dangerous. SAKSI's
defenses: (a) **factual events, not verdicts**; (b) **truth** (payment-anchored);
(c) **right of reply** (14-day hak jawab); (d) neutral language, no "penipu", no
score. This is why the invariant is non-negotiable.

### 6.2 UU PDP (Law 27/2022) — personal data
Rekening/phone tied to a person = personal data; fully enforceable since Oct 2024.
Requirements SAKSI must honor: lawful basis / consent (baked into the attestations
+ T&C), **data minimization** (store the event + hash, not raw KTP), the **right to
erasure** (reconciled via the tombstone / off-chain-delete + dangling-anchor model,
NOT immutability), a DPO, and never publishing KTP/NIK, addresses, or minors. Any
future B2B data sale must be *purpose-limited (fraud prevention only)*, *consented*,
and *share indicators/scores, not raw dumps* (see `06`).

### 6.3 Crypto / legal tender — why money never touches SAKSI
Indonesia's Currency Law (No. 7/2011) makes **rupiah the sole legal tender**;
crypto-as-payment is **prohibited even if both parties agree** (BI enforces this;
as of Jan 2025 crypto oversight moved Bappebti → OJK, and enforcement tightened).
Therefore: **no on-chain settlement**, and more generally **SAKSI never holds
transaction money** — buyers pay sellers bank-to-bank directly. SAKSI records
evidence of payments; it is not a payment rail. This keeps it unlicensed and cheap.

### 6.4 Meterai law (UU 10/2020) — evidence, not validity
A common misconception: meterai does **not** make an agreement legally valid or
binding — a contract is valid without it (KUHPerdata Art. 1320). Meterai is a
**document tax**, and its function is **evidentiary**: it makes a document
*court-ready as alat bukti* without needing "pemeteraian kemudian" later. So SAKSI's
meterai feature must be marketed as **"dokumen bermeterai — siap jadi alat bukti"**,
NEVER "sah secara hukum" / "dijamin". It is affixed (via a licensed distributor —
Mekari Sign / Privy) to a *completed-transaction document*, not a blank invoice.
"Berbadan hukum" (being a legal entity) is a different concept entirely and has
nothing to do with meterai.

## 7. Public surfaces (what's rendered, and how it stays honest)

- **Check page / profile:** aggregate **counts per outcome** (an 8-bucket set:
  selesai, dibatalkan bersama, tidak dilanjutkan, kedaluwarsa, dikembalikan penuh,
  dikembalikan sebagian, tidak dipenuhi, klaim berbeda aktif) — **NEVER a score.**
  Empty state uses the locked line that explicitly refuses to reassure: *"Belum ada
  riwayat di SAKSI. Ini bukan jaminan aman. Sebagian besar rekening belum
  tercatat."*
- **Flag page:** the breach/wanprestasi record at the correct tier rung, published
  only after the hak jawab window, attributed to the phone number recorded as
  the reporting party to this deal (`identifyPartyByPhone`, not OTP-verified
  possession — see §25 correction above).
- **Forced-check mechanic:** on the payer page the copy-rekening button stays
  disabled until the destination account's history card has rendered — the buyer is
  *made* to see the record before paying.

## 8. What this means for anyone extending the ledger

- Any new state transition must **anchor** (SHA-256 + OpenTimestamps) like the
  others.
- No new column may become a second source of truth for what `deal_events` already
  holds.
- No public surface may render raw PII or a computed "trust score."
- No new user-facing string may claim safety/trust/validity that isn't literally
  true — route every string through `copy-id.md` and the invariant review.
