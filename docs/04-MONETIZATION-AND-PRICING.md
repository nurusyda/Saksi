# 04 — Monetization & Pricing

## 1. The governing principles

1. **Never charge for what generates data.** Invoices, records, disputes, and
   basic checks stay free — the free loop is the data engine and the growth loop.
   Metering it strangles both.
2. **Charge for what captures value** — the credibility that closes sales, the
   official paperwork, and later the credit access. Not the tool that sends the
   invoice.
3. **Sell a service you *perform*; never sell a status that's *earned*.** You may
   sell verification, a stamped document, or convenience tools. You may **not**
   sell a reputation badge or score — if a scammer could pay to look trustworthy,
   the signal is worthless. A paid seller with no real deals must show an *empty*
   record.
4. **Anchor prices to a lost sale, not to software.** "Cheaper than one customer
   who walked because they didn't trust you."
5. **In Indonesia, sell prepaid "paket" over QRIS/e-wallet, not auto-renew
   subscriptions.** Culturally, a *paket* is a thing you buy; a *langganan* that
   drains you is resisted. E-wallets + QRIS dominate; the habit is frequent
   micro-transactions ≤Rp100k.

## 2. The consumer model (the bridge revenue)

| Tier | Price | What it is |
|------|-------|-----------|
| **Gratis (free loop)** | Rp0 | Send invoice links, WA-send, the earned track record (accrues but not displayed as a badge on free), buyer check + dispute. The data engine. |
| **Saksi Store** | **~Rp100k one-time** *(price is a scammer-filter dial; test 50–100k)* | The persistent seller profile: rekening/QRIS **embedded once** (never re-typed), one-tap **bulk / PO** invoicing, **verified-rekening marker**, custom store link, and the **displayed** factual record. |
| **Saksi Resmi (e-meterai)** | **~Rp30k per deal, buyer-initiated** | A court-ready, meterai-stamped *completed-transaction document* for serious/high-value deals. |

Notes:
- **The Store's "pride badge" must obey the invariant** — it displays only *true
  facts* (verified-identity/rekening-control marker + factual counts like "47
  transaksi selesai"), never a score or "terpercaya". You are selling the
  *display surface* for a real earned record, not fake status. The best upsell is:
  a free user accrues an *invisible* record, and once it's substantial you prompt
  "Kamu udah punya 34 transaksi bersih — upgrade biar pembeli bisa lihat."
- **Why the Store justifies Rp100k:** for a power seller (jastip/PO doing dozens of
  deals/day), the embedded rekening + one-tap bulk + auto-Sheets + verified
  storefront is felt every day. The *friction of manual re-entry in the free tier
  is the deliberate upsell engine.* Casual sellers stay free.

## 3. Saksi Resmi (buyer-initiated meterai) — the design

- The **buyer** chooses and pays (aligns payer with the party who bears the risk;
  zero friction for the seller; self-selects to serious/high-value deals where 30k
  is trivial and meterai is legally relevant, ~Rp5jt+).
- Stamp the **completed transaction document** (item, amount, rekening, timestamps,
  and the bukti), NOT a blank invoice — a stamped record of a *completed*
  transaction is real evidence; a stamped empty invoice proves nothing.
- **Wording (legal):** "dokumen bermeterai — siap jadi alat bukti", never "sah
  secara hukum" / "dijamin". (See `03` §6.4.)
- **Margin check before committing to Rp30k:** meterai face value Rp10,000 +
  distributor fee + e-sign fee. Verify the Mekari/Privy per-stamp cost — margin may
  be only ~Rp12–18k. Requires a **meterai prepaid float** (working capital for
  pre-bought stamps).

## 4. KYC — on hold, and why the badge is not the point

- KYC is currently **on hold** (gated behind revenue). When enabled, its real value
  is **anti-churn accountability**: it anchors reputation to a *person*, so a burned
  identity can't re-verify clean and the record survives rekening/handle churn.
- **But KYC is cheaply defeatable** — KTP+selfie sets trade for ~Rp15–25k+ and
  deepfakes bypass liveness for <$20. So **never market the badge as "aman" /
  guaranteed.** The badge means "this seller staked their real identity", not
  "safe". The *un-fakeable* part is the **track record** (real time + real money +
  clean disputes), which no bought identity can manufacture. Sell the *combination*
  (identity bound to record), lean the trust story on the record.
- **SAKSI-specific hardening (cheap, unique):** a 3-way name match — KYC identity
  name == claimed payout rekening name == recipient name on the buyer's bukti (via
  the OCR SAKSI already runs). A scammer who KYCs as A but funnels to account B
  fails instantly.
- **Do not store raw KTP/selfie** — use a licensed vendor (Privy/VIDA/Verihubs/
  Didit) that returns pass/fail + a token; hold the *result*, not the ID. Watch for
  vendor **monthly minimums** — keep KYC off until paying verified sellers offset
  it. (In the current app, KYC = Didit, tied to the Bermeterai tier.)

## 5. Who pays / who never pays

- **Buyers — never.** They are the sensor network and half the data. Free forever.
- **Casual sellers — free.** You want their transactions in the ledger.
- **Power sellers (jastip/PO/resellers) — the payer.** Their reputation is their
  income; they pay to build, protect, and display it (Store), and to check buyers.
- **Institutions (banks/PJP/marketplaces/lenders) — the big payer, later** (B2B
  data + credit; see `06`).

The rule: **monetize the motivated, never the vulnerable.** Charging the broke
student victim was always going to fail.

## 6. B2B / data monetization (later — the real money)

Once coverage exists, the rekening/QRIS-NMID-keyed dispute + income ledger becomes
sellable to institutions blind to off-platform fraud — as **aggregate fraud
intelligence** (safest, earliest), a **fraud-signal API** (score/flag on a
rekening/NMID/phone), a **payment-moment embed** (e-wallets warn users at transfer
time using SAKSI's signal — the loop SAKSI can't close itself without rails), and
ultimately a **governed fraud-indicator consortium.** All gated behind consent +
purpose-limitation + score-not-raw-data (UU PDP). Full treatment in `06`.

## 7. Pricing reconciliation with the CURRENT app — **DECISION NEEDED**

The built app's locked tier spec is **per-party, per-deal**: `GRATIS` /
`LIMA_RIBU` (Rp5.000/pihak) / `BERMETERAI` (Rp50.000/pihak, includes Didit e-KYC +
evidence-pack PDF). The newer model above is **free loop + Rp100k one-time Store +
Rp30k buyer-meterai + credit/data later.**

These conflict. The tension: **charging Rp5.000 per deal (`LIMA_RIBU`) taxes the
exact logging behavior the free loop needs to maximize for data and adoption.**

**DECISION NEEDED (human, then update `data-model.md` + `copy-id.md`):**
- (a) **Recommended:** make the loop genuinely free, fold `LIMA_RIBU`'s value
  (phone_hash on flags, OTP) into free or the Store, reprice meterai to buyer-opt-in
  Rp30k, and add the Store (Rp100k one-time) as the new charge dimension. — or
- (b) Keep per-deal micro-fees and layer Store on top.

Interim state in the code: the create form now hardcodes **`tier = GRATIS`** (the
tier selector and the paid-interest signal were removed from the UI per the
invoice-reframe; see `07`). This is consistent with option (a) but is not yet the
formally-reconciled locked decision — resolve it before building the Store.
