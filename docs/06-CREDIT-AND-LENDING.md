# 06 — Credit & Lending (The Real Prize)

## 1. The unlock: SAKSI accidentally knows the seller's income

Because every "kak aku mau bayar" runs through SAKSI, the ledger accumulates
**verified, bukti-anchored cash-flow data** on sellers who are otherwise invisible
to the formal financial system. This moves SAKSI off the fraud-data ladder and onto
the far larger **credit-data** ladder.

Why it's valuable: Indonesia's MSME financing gap is **US$165B (IMF) to US$234B
(IFC)**; ~91M adults are unbanked/underbanked; MSMEs are ~60% of GDP. The reason
they can't borrow is documented plainly: *rigid requirements — credit history,
collateral, documented income* — i.e. **thin files, no documented income.** SAKSI
produces exactly the missing input, and — crucially — it is **verified** (real
money movements proven by transfer receipts), not a proxy like telco/social data.
That makes it higher-quality underwriting data than most "alternative data".

## 2. The monetization ladder (each tier ~10× the last)

| Tier | What you sell | Buyer | Rough economics |
|------|---------------|-------|-----------------|
| **1. Fraud signal** | "is this rekening/NMID/phone dispute-associated?" | PJPs, marketplaces | cents/query |
| **2. Creditworthiness score (ICS)** | a SAKSI credit/trust score on a seller | banks, P2P, BNPL | ~$1–5/inquiry |
| **3. Embedded lending referral** | a proven seller matched to a licensed lender | the lender | **~2–3% of each loan** — the real money |

**Per-seller multiplier:** the same seller is worth ~pennies as a fraud data point,
~$1–5 as a credit score, and **~$50–500+/yr as a borrowing customer.** A seller is
worth ~1,000× more as a lending customer than as a data point. That is why lending
dwarfs everything else.

## 3. The regulatory path (this is a licensed, precedented business)

- **Innovative Credit Scoring (ICS)** is regulated and licensable: **OJK Regulation
  No. 29/POJK.03/2024 on Alternative Credit Scoring**, using alternative data
  (e-commerce, transactions) to score thin-file borrowers. There is a regulatory
  sandbox with AFTECH as umbrella. **TrustDecision is already OJK-licensed as an ICS
  provider** — precedent exists.
- **You do not become a bank.** Two routes: (a) become a licensed **ICS provider**
  (sell scores), or (b) **partner with a licensed lender** (P2P/multifinance/bank)
  who provides capital + risk + license while SAKSI provides data + the borrower.
  **Start with (b)** — faster, capital-light.
- **Digital lending context:** Indonesia's digital-lending market ~US$15B (2025),
  P2P outstanding IDR 77T (+29% YoY), and OJK wants MSME lending up to 50–70% by
  2028 — strong policy tailwind.

## 4. Option A — the plain-English lending model (chosen)

The founder chose the simplest, safest structure ("Option A"):

- **SAKSI is the matchmaker with the good information, not the lender.** A licensed
  lender puts up the cash and takes the risk. SAKSI (a) has the income data that
  proves the seller is good for it, and (b) surfaces the loan offer inside the app
  the seller already uses.
- **"How do we know she'll pay?"** You don't — all lending is a bet. But it's the
  *lender's* bet, not SAKSI's. The data makes it a *smart* bet (steady income = can
  pay; clean track record = reliable). And the borrower is motivated to repay
  because default wrecks their name: it's reported to **SLIK** (the national credit
  record every bank checks) and kills future access — reputation *is* the collateral
  for uncollateralized lending.
- **"How does she pay back if SAKSI doesn't hold the money?"** Three options,
  simplest first: **(A) the lender collects directly** (normal loan repayment; SAKSI
  is not involved in collection — chosen for MVP); (B) an auto-debit mandate;
  (C) money flows through SAKSI (the "repay from each sale" version — but that needs
  a payment license, a whole different business). **Start with (A).**
- **How SAKSI earns:** a **~2–3% referral/origination fee** per loan (≈Rp375k on a
  Rp15M loan), optionally a small share of interest, and/or a per-credit-check fee.
  Smallest slice but zero risk and no license. SAKSI's leverage: the lender pays
  well only if the referred borrowers actually repay — finding creditworthy
  thin-file borrowers is the lender's hardest job, and it's exactly what the data
  does.

## 5. Loan-sizing formula (from the seller's income data)

```
Loan size  = average monthly income × trust multiplier
             (new borrower ×0.5 ; proven 6+ mo clean ×1 to ×2)

Affordability check: monthly repayment ≤ ~30% of average monthly income.
                     If it exceeds, shrink the loan or lengthen the term.

Adjust for reality:
  - wobbly income  → use the low months, drop the multiplier
  - disputes       → lower the amount or decline
  - repaid before  → raise the multiplier
```

Worked example: a seller earning ~Rp15M/mo for 8 clean months → first loan
~Rp7.5–12M (so ~Rp10M fits), repaid over 3 months (~Rp3.5–4M/mo ≈ 27% of income,
affordable). Next clean cycle → ~Rp20–25M. The loan grows with proven trust.
**SAKSI proposes; the licensed lender sets final rules and approves the amount**
(their money, their risk). Note SAKSI only sees income *routed through it* — treat
the figure as a floor and size conservatively.

## 6. The ethical guardrail (non-negotiable, given SAKSI's origins)

SAKSI began as **scam-victim protection.** Becoming a lending channel to vulnerable,
thin-file sellers is one step from enabling Indonesia's predatory-pinjol crisis —
over-indebtedness, aggressive collection, debt traps. The mission-aligned version:
SAKSI as the **credit on-ramp that lets honest informal sellers access *fair* formal
credit they were locked out of** — responsibly underwritten, with affordability
limits, lending people only what they can *safely* repay, not the most they'll
accept. Hold this line deliberately, or the data meant to protect people becomes the
data that traps them.

## 7. Sequencing (do not skip)

Coverage is the entire moat — the credit data is worthless until the ledger covers
enough sellers with enough months of history. So:
1. Grow the free consumer loop (the data-manufacturing engine).
2. ~M18: aggregate fraud intelligence (safe, no personal data, earliest B2B $).
3. ~M18–24: fraud-signal API + a payment-moment embed for PJPs/e-wallets.
4. ~M24+: creditworthiness scores (ICS route or partner) → embedded-lending referral
   (Option A) with a licensed lender.

This is a different company muscle (enterprise B2B sales, data engineering,
compliance) than the consumer app — a real second act, not a toggle.
