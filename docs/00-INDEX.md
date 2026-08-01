# SAKSI — Complete Working Documentation (Index)

This folder is the full written record of the strategy, research, financial model,
legal reasoning, and product/technical decisions behind SAKSI, produced so the
work can be continued by another engineer or Claude Code instance **without
re-deriving anything from scratch.**

These are **complete reports, not summaries.** Read the one relevant to your task
in full before acting. Where a decision is still open, it is marked
**DECISION NEEDED** and belongs to the human founder.

## Context in one paragraph

SAKSI is a deal-witnessing web app for Indonesian informal / social-commerce
(jastip, PO/pre-order, fandom sales, kos deposits, personal loans). A seller
creates a **tagihan** (invoice), sends the buyer a **link instead of a bare bank
account number**, the buyer pays and uploads proof, and every step is recorded to
a tamper-evident, rekening/QRIS-keyed ledger. It is **NOT** an escrow (never holds
money), **NOT** a scam-accusation site, **NOT** a notary. The founder is solo,
pre-revenue, based in Indonesia, building on an existing Next.js + Supabase
codebase that has already been partially reframed from an abstract "kesepakatan"
(agreement) tool into a seller-first invoice tool.

## The document set

| # | File | What it covers |
|---|------|----------------|
| 00 | `00-INDEX.md` | This file — orientation, reading order, current state |
| 01 | `01-PRODUCT-THESIS-AND-RESEARCH.md` | Why this exists: the 64-case scam-victim study, the problem, the core "invoice × rekening ledger" thesis, the dual tagihan/kesepakatan frame, the ICP |
| 02 | `02-CUSTOMER-DISCOVERY-JOURNEY.md` | Every strategic pivot and *why each earlier idea was rejected* (checker, escrow, "nobody reports", who has the most pain, the seller-first link-substitution wedge, trustless→verifiable, Kredibel's failure mode) |
| 03 | `03-LEDGER-DESIGN-AND-LEGAL.md` | The neutral event ledger, the one invariant, the two doors (good/bad ledger), tamper-evidence, and the legal walls (UU ITE defamation, UU PDP, crypto/legal-tender, meterai law) |
| 04 | `04-MONETIZATION-AND-PRICING.md` | Free loop + seller tiers (Akun Saksi Rp20k one-time, Toko Saksi Pro Rp200k/yr) + Saksi Resmi meterai (Rp30k) + KYC + B2B data; "sell services, never earned status"; reconciliation with the current app's tiers |
| 05 | `05-FINANCIAL-MODEL.md` | TAM/SAM/SOM, full CapEx/OpEx with an infra bill-of-materials and real provider prices, COGS, month-by-milestone projections, break-even, ROI, caveats |
| 06 | `06-CREDIT-AND-LENDING.md` | The income-data unlock, the fraud-data → credit-score → embedded-lending ladder, ICS regulation, the plain-English lending model, loan sizing, ethical guardrails |
| 07 | `07-CURRENT-APP-AND-CHANGES.md` | What is already built, what was already changed in the invoice reframe, what remains to do (due-date field, Store layer, WA/Sheets, meterai rework), discipline & gotchas |
| 08 | `08-INVESTOR-PITCH.md` | The pitch, built on the Y-Combinator / Michael Seibel seed-pitch framework, filled with SAKSI's numbers |

Related existing files at repo root: `CLAUDE.md`, `STORE_AND_UI_HANDOFF.md`, and
`.claude/skills/saksi-builder/` (the LOCKED product spec — `data-model.md`,
`copy-id.md`, `integrations.md`, `ops.md`).

## Suggested reading order

- **To continue the *build*:** 07 → 04 → 03 → the `saksi-builder` skill references.
- **To continue the *business / fundraising*:** 01 → 02 → 05 → 06 → 08.
- **To understand *why anything is the way it is*:** 01 → 02 → 03.

## The one invariant that overrides everything (repeated in every relevant doc)

Every string SAKSI shows must be **true even when a user is lying to it.** Claims
are attributed to claimants; absence of records never reassures; OCR says
"konsisten", never "asli"; **no scores, no "aman", no "terpercaya".** When in doubt
between a stronger claim and a weaker true one, ship the weaker true one. This is
not a style preference — it is the app's legal footing. Do not violate it in code,
copy, marketing, or the ledger.

## Current state (as of this writing)

- The **invoice reframe of the front door is done**: font bug fixed, landing page
  rebuilt as an invoice tool, create form reframed (heading, seller-first default,
  invoice-language section labels), Penjual/Pembeli role selector removed, tier
  selector removed, "Cek Rekening" removed from the landing, and the tagihan vs
  kesepakatan boundary documented as `copy-id.md` §20. Front-door strings are
  centralized in `lib/copy.ts`. Typecheck passes.
- **Resolved, not pending (§29, 2026-07-21):** the "visible due-date field on
  the create form" item this line used to list as immediate/pending was
  decided the other way — the deadline box was removed from the create form
  entirely (a warning about failure before the seller has done anything reads
  wrong on a "make a bill" form); the deadline still shows, read-only,
  load-bearing on the invoice the buyer reads (`formatDeadlineWib`), not as an
  editable input anywhere.
- **Resolved, not pending (2026-08-01):** the pricing reconciliation decision
  — see docs/04 §7 — landed on the two-tier seller model (Akun Saksi Rp20k
  one-time, Toko Saksi Pro Rp200k/yr), applied to the app in migration 0039.
- **Bigger pending pieces:** the Saksi Store layer, WA-send (re-evaluate the
  channel; Fonnte was tried and removed, see ops.md), Google Sheets sync,
  buyer-initiated meterai build-out.
- **Not started (later phases):** B2B fraud-data product, credit scoring / lending
  referral.
