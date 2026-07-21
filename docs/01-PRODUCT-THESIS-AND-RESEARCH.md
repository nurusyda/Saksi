# 01 — Product Thesis & Research Foundation

## 1. Where this came from

SAKSI began from a piece of primary research: a **netnographic study of 64
publicly-posted cases** of Indonesian scam victims and bystanders on social media
(primarily X/Twitter, plus Threads, a consumer-complaint site, and one news
outlet). The corpus was coded against a 27-variable scheme. Two source files back
this:

- `Netnographic_Study_Scam_Victims_Indonesia.docx` — the written study.
- `final_dataset_n64.csv` — the coded dataset (64 rows × 27 columns), cases
  P001–P064.

Of the 64 cases: **42 are victim-incidents**, **22 are bystander/warning posts.**

**This research is the reason the product exists and the reason it is shaped the
way it is.** Every design decision traces back to a finding below.

## 2. The findings that matter (with the evidence)

1. **Institutional redress is broken, not merely slow.** Of 42 victim-incidents,
   11 reached a bank, the national anti-scam centre (IASC/OJK), or the police.
   **0 of those 11 recovered any money.** This is directionally consistent with
   Indonesia's own IASC/OJK actuals (~2.1% of reported losses returned), and
   contradicts the ~22% recovery rate regional victim surveys claim.

2. **Victims do not check before paying.** **0 of 42** victims checked a database,
   checked seller testimonials, or used escrow before paying. They trust first,
   then get scammed. (This single fact kills any "build a checker" strategy — see
   `02-CUSTOMER-DISCOVERY-JOURNEY.md`.)

3. **A single mechanism — settlement-time lag — causes three different harms.**
   The gap between a transfer's displayed timestamp and the receiving system's
   settled timestamp (especially across midnight) independently (a) defeated a
   real victim's IASC report ("waktu transaksi tidak sesuai", P051), (b) froze an
   innocent recipient's account (P005), and (c) manufactured a mutual fraud
   accusation between two honest parties (P056). This is the study's most
   structurally specific finding.

4. **Reporting promptly did not help.** Four victims reported with no delay (two
   same-day). All four still failed, and failed at the institution's end —
   opposite to the standard "victims report too late" explanation.

5. **The only recovery in the entire corpus was informal.** One case (P050) — a
   person who had referred a friend to a fraudulent seller voluntarily repaid 50%
   of the loss out of his own pocket. No institution was involved in the one time
   money moved back toward a victim.

6. **The crowd does the work institutions do not.** Warning posts function as a
   distributed, unpaid fraud-prevention archive. A warning prevented a loss 22
   months after it was posted (P026). A QRIS-merchant fraud signature was derived
   and published by a warner with no registry access (P062). BUT the archive is
   fragile: threads get deleted (P054), and perpetrators lock accounts to defeat
   the handle-search the crowd relies on (P048, P055).

7. **The stable identifier is the QRIS merchant ID (NMID) / rekening — not the
   handle.** One perpetrator was tracked across **four aliases over 13 months**
   while the QRIS registration stayed constant (P055). Handles are free to change;
   the money destination is not. **This is why SAKSI keys its ledger on
   rekening/QRIS-NMID, never on social handles.**

8. **Reporting channels are structurally mismatched.** The one IASC report that
   eventually succeeded (P052, accepted on the 6th attempt) required a police
   report number as a supporting document; only 1 of 42 victims (2.4%) filed a
   police report. The channel that works presupposes a step almost no victim takes.

Loss amounts (21 of 42 with a parseable figure): min Rp10,000, median Rp1,000,000,
max Rp200,000,000, mean excluding one outlier Rp2,400,450 (near the GASA national
average of Rp1,723,310).

## 3. The core problem, stated plainly

Indonesian informal / social-commerce buyers **trust first**; when they are
scammed, **institutions do not recover their money**; and the **crowd's informal
protection is real but ephemeral** (deleted, handle-keyed, retrospective). The
people most harmed are transacting in markets too small, too urgent, and too
informal for any existing protection (escrow, marketplace guarantees, police) to
reach them.

## 4. The product thesis: invoice × rekening ledger

SAKSI is the intersection of two things:

- **An invoice (tagihan):** the artifact a seller already makes and sends to get
  paid. This is the *reason the seller uses the app* — it is useful to them today,
  independent of fraud.
- **A rekening/QRIS-keyed witness ledger:** every completed (or breached) invoice
  becomes a durable, tamper-evident record attached to the *money destination*,
  which survives handle/alias churn.

The invoice is the **Trojan horse**; the ledger is the **asset.** The seller thinks
they are getting a free, clean way to bill a buyer. What SAKSI gets is:
(a) the transaction into a durable ledger, (b) exposure of the buyer to the brand
(every invoice markets SAKSI to a new person), and (c) a growing reputation the
seller cannot take elsewhere (lock-in).

Critically: **money never flows through SAKSI.** The buyer pays the seller
bank-to-bank as normal; SAKSI only records *evidence that* a payment happened.
This keeps SAKSI unlicensed (no payment/e-money license), cheap to run, and out of
the crypto/legal-tender wall (see `03-LEDGER-DESIGN-AND-LEGAL.md`).

## 5. The dual frame — tagihan vs kesepakatan (both true)

This distinction is load-bearing and is codified in `copy-id.md` §20:

- The seller **creates and sends a `tagihan`** (invoice) — the *creation + share*
  surface: landing page, create form, the deal-link/share card. This is what the
  seller touches.
- Once the buyer joins, it is a witnessed **`kesepakatan`** (mutual agreement) —
  the *lifecycle, breach, flag, T&C, notifications.* This is what SAKSI legally
  records and publishes.

Both words are true. **Do not "reframe" the kesepakatan strings to tagihan** — the
breach/flag/T&C language is legally about the mutual agreement, and renaming it
would make the app claim to record something it doesn't, violating the invariant.

## 6. Who it is for (the ICP)

- **Primary customer (the payer): the off-marketplace social-commerce seller** —
  jastip, PO/pre-order organizers, fandom (K-pop tickets/merch/account) sellers,
  student-service sellers (joki, Turnitin), small IG/TikTok/WhatsApp sellers — who
  transact via **direct bank transfer / QRIS**, not through a marketplace with a
  built-in rating system, and therefore have **no portable trust signal.**
- **The vulnerable population the research is about (broke students, young fandom
  buyers in grey micro-transactions)** are the *beneficiaries and the sensor
  network*, not the paying customer. See `02-CUSTOMER-DISCOVERY-JOURNEY.md` §4.

## 7. What SAKSI explicitly is NOT

- **Not an escrow / rekber.** It never holds transaction money. (This is both a
  legal choice and the reason it can serve sub-escrow-threshold micro-deals.)
- **Not a scam-accusation site.** It records neutral events attributed to
  claimants; it never labels anyone "penipu" and never publishes a score.
- **Not a notary.** Meterai (when added) makes a document *court-ready evidence*,
  not legally "valid" — see `03` and `04`.
