# 02 — Customer Discovery Journey (Every Pivot and Why)

This document records the full reasoning path that produced the current product.
It exists so nobody re-proposes an idea that was already reasoned through and
rejected. Each section is: **the idea → why it fails → what it forced.**

## 1. Idea: "Build a fraud checker / verification tool" — REJECTED

**The idea:** let a buyer check a rekening/QRIS before paying.

**Why it fails:** the research is unambiguous — **0 of 42 victims checked anything
before paying.** Victims trust first. Worse: **Kredibel and cekrekening.id already
exist, are free, and not one victim in the corpus used them.** The failure is not
"the checker covers the wrong key"; it is that **"a thing you must choose to open
before paying" is a category the victim population does not use.** A better checker
loses for the same reason the existing ones did.

**What it forced:** stop building anything that depends on the buyer's foresight to
*pull* a check. Verification must be *pushed* or *ambient*, not a destination.

## 2. Idea: "Escrow / rekber for these deals" — REJECTED as the core

**The idea:** hold the money until the buyer confirms receipt.

**Why it fails:** (a) The people with the most pain transact in amounts too small
and too urgent for escrow — nobody uses rekber for a Rp10,000 Turnitin check or a
time-limited concert ticket. (b) **Rekber users already have high trust** — they
are the cautious population; building for them is building for people who don't
hurt. (c) Holding money requires a payment/e-money license SAKSI deliberately
avoids.

**What it forced:** SAKSI records *evidence of* payments; it never holds them. And
the target is the population escrow *cannot* reach, not the population already
using escrow.

## 3. Idea: "A reporting platform (people report scams)" — REJECTED as primary

**The idea:** victims report scams; the reports build a registry.

**Why it fails:** **people don't report — especially when there is no money at the
end of it.** Reporting is altruistic and post-hoc; with no reward, almost nobody
does it. (This is also why Kredibel-style registries stay thin.)

**What it forced:** the only behavior that is *universal* in the corpus is that
**100% of victims disclosed publicly** — they vent, warn, and want the perpetrator
exposed. So the data source cannot be *solicited reports*; it must be *the venting
that already happens*, or a byproduct of a self-interested action.

## 4. Question: "Who actually has the most pain?" — the ICP sharpens

Subtract the people who don't need SAKSI:
- **Big-ticket institutional reporters** (P016 Rp200jt, P052, P002) — high pain,
  but their need is *recovery*, which is unfixable (0/11). Not the market.
- **Rekber users / near-misses** — trust already solved.

What remains: **broke students and young fandom buyers transacting small, urgent,
informal, often grey/shameful/ToS-violating services** — joki (academic
ghostwriting, P007/P012), Turnitin checks (P018), account sales (P021), kos
deposits (P001/P051), tickets/PO (P003/P055/P063). Their losses are trivial in
rupiah but huge relative to them (a month's food money, P017), they are repeat-hit
(P064 "kena 2 kali"), and they are **structurally excluded from every formal
recourse** — too small/urgent for escrow, too informal/grey/shameful for police or
institutions. **Peer trust is the only mechanism they have, and right now it's
broken.**

**Consequence:** this pain population *cannot use rekber* — which killed an earlier
"rekber as the record engine" idea. Their trust signal has to come from somewhere
escrow cannot sit.

## 5. The unlock: seller-first "link substitution" — ADOPTED

**The insight:** at "kak aku mau bayar", the seller *already* sends something —
their rekening or QRIS. SAKSI does not add a step; it **substitutes** what the
seller sends: a **Saksi link instead of a bare rekening.** The seller's habit
doesn't change, the buyer's habit doesn't change (they still just pay), but now
every payment runs through SAKSI and leaves a record. **This is the move that beats
trust-first behavior: nobody has to decide to "check" anything — the protection
rides inside a habit that already exists.**

Why the *seller* and not the buyer: the buyer is trust-first and unmotivated; the
**seller is motivated** (a good seller wants to look legitimate and close the
sale, and the link becomes their trust signal). Distribution is *seller-carried*,
not buyer-pulled.

## 6. The two doors — you need both — ADOPTED

- **Door 1 (seller-invoice):** builds the **good ledger** (positive track record +
  the seller-facing revenue). Scammers won't send Saksi invoices, so this door
  alone has no fraud signal.
- **Door 2 (buyer-dispute):** builds the **bad ledger** (fraud signal + buyer
  protection). A scammer never invoices, but their victim can still log the
  scammer's rekening/QRIS and file a dispute. Keyed on QRIS-NMID, this catches the
  repeat offender even after alias churn (P055).

Door 1 without Door 2 = a reputation toy. Door 2 without Door 1 = Kredibel (no
revenue, no positive side). **Together they are the moat.** Note: SAKSI catches bad
actors *retrospectively* (after victim #1 disputes) — it shrinks repeat/cluster
harm, it does not save the first victim. No account-keyed system can.

## 7. Why not Kredibel-with-better-data — the distribution insight

Kredibel fails to get read because **it is a destination website you must decide to
visit.** Trust-first buyers never do. SAKSI's difference is **not** the data
structure (that alone gets ignored); it is:
1. **Keying on QRIS NMID** (survives alias churn) — nobody does this.
2. **Payment-anchoring** every entry (events, not free-text accusations).
3. **Ambient, in-flow distribution** — carried by the seller and embedded in the
   transaction, not a site to visit.

The ledger is the invisible backend; the *product* is the in-flow invoice moment.
Kredibel made the ledger the destination; SAKSI makes it infrastructure.

## 8. "Trustless / blockchain" — REJECTED in favor of "verifiable"

The founder asked whether to make it trustless (blockchain). Reasoned through and
rejected, because:
- **Trustless solves the wrong half.** It fixes custody/censorship/tamper; it does
  **not** fix truth/Sybil/oracle — which is the actual hard problem here.
- **Two Indonesian legal walls make full trustlessness illegal:** (a) crypto is
  prohibited as a *means of payment* (rupiah is sole legal tender), so on-chain
  settlement of goods is illegal; (b) UU PDP's *right to erasure* conflicts with
  blockchain immutability, and immutable + false accusation = permanent,
  un-deletable defamation.

**Adopted instead: "verifiable, not trustless"** — a tamper-evident append-only log
(SHA-256 + OpenTimestamps), hash-anchored (never published) evidence, and
right-to-respond. See `03-LEDGER-DESIGN-AND-LEGAL.md`.

## 9. The reporting-incentive problem, finally solved — the invoice byproduct

The recurring wall was: *nobody performs a deliberate anti-scam action, before or
after.* The resolution is that the ledger entry is a **byproduct of a selfish,
in-the-moment action** — the seller documenting their own invoice and getting the
counterpart to acknowledge it — **not** an altruistic report. The record is the
residue of an act the seller wanted to do anyway. This is the same trick eBay's
auto-feedback and rekber's release-confirm use, achieved **without holding money.**

## 10. What all of this converges on

A **free invoice link for off-marketplace sellers that turns every completed deal
into portable, un-fakeable, rekening/QRIS-keyed reputation** — free to send, paid
to prove — distributed by the motivated seller and consumed passively by the
trust-first buyer. The humble invoice link is the wedge; the ledger it fills is the
long-term asset; the credit business that ledger eventually enables is the prize
(see `06-CREDIT-AND-LENDING.md`).
