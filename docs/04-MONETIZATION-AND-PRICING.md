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
| **Standard (free loop)** | Rp0 | Send invoice links, the earned track record, buyer check + dispute. The data engine. |
| **Akun Saksi** | **Rp20.000 sekali bayar** | Phone login, saved rekening, displayed track-record badge. The first paid rung — sells convenience (no retype) and a display surface for a real earned record. |
| **Toko Saksi Pro** | **Rp200.000/tahun** | Seller logo on invoice + `saksi.app/namatoko` storefront. For power sellers (jastip/PO/resellers). |
| **Saksi Resmi (e-meterai)** | **Rp30.000 per deal, buyer-initiated** | A court-ready, meterai-stamped *completed-transaction document* for serious/high-value deals. (Future.) |

Notes:
- **The Store's "pride badge" must obey the invariant** — it displays only *true
  facts* (verified-identity/rekening-control marker + factual counts like "47
  transaksi selesai"), never a score or "terpercaya". You are selling the
  *display surface* for a real earned record, not fake status. The best upsell is:
  a free user accrues an *invisible* record, and once it's substantial you prompt
  "Kamu udah punya 34 transaksi bersih — upgrade biar pembeli bisa lihat."
- **Why Akun Saksi justifies Rp20.000 and Toko Saksi Pro justifies Rp200.000/tahun:**
  Akun Saksi sells the convenience of never re-typing a rekening and the display of
  an earned track record. Toko Saksi Pro adds a storefront and branded invoices —
  felt every day by power sellers (jastip/PO/resellers doing dozens of deals). The
  *friction of manual re-entry in the free tier is the deliberate upsell engine.*
  Casual sellers stay free.

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
  it. (In the current app, Didit was tied to the old BERMETERAI tier — both are
  removed; re-evaluate when Saksi Resmi is built.)

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

## 7. Pricing reconciliation — RESOLVED 2026-08-01

The old per-deal tier model (`GRATIS` / `LIMA_RIBU` Rp5.000/pihak / `BERMETERAI`
Rp50.000/pihak) has been removed from the schema (migration 0039), the flag body
templates, and all copy constants. The new seller-account model (Akun Saksi
Rp20.000 one-time, Toko Saksi Pro Rp200.000/tahun, Saksi Resmi Rp30.000
buyer-initiated) is the sole pricing taxonomy.

**Decision:** Option (a) — the loop is genuinely free. Seller account tiers sell
convenience and display, never counterparty verification and never a bought
reputation. All deals are standard (GRATIS); tier is now a seller-account concept,
not a per-deal one.

All create-form tier selectors, paid-interest signals, and old tier labels have
been removed from the UI. Toko Saksi Pro renders as a greyed, inert card on the
riwayat page (Belum tersedia). Akun Saksi is deliberately NOT surfaced anywhere
— it is the price of an account, and accounts do not exist yet. Payment
integration is not implemented; re-evaluate providers when tier fees are enabled.
