---
name: saksi-builder
description: Build and extend SAKSI, an Indonesian deal-witnessing web app (mencatat kesepakatan jual-beli informal, flag wanprestasi, evidence pack). Use this skill whenever the user asks to build, code, scaffold, debug, or extend any part of SAKSI — the deal record flow, tier system (Akun Saksi Rp20rb/Toko Saksi Pro Rp200rb/tahun), bukti transfer upload/OCR, flag pages, check pages, state machine, payment integration, or evidence-pack PDF. Also use it when the user mentions "kesepakatan", "wanprestasi", "rekening check", "HnR", or SAKSI by name. This skill contains locked product decisions (copy strings, state machine, tier spec, legal constraints) that MUST be followed exactly — do not improvise alternative wording or states.
---

# SAKSI Builder

SAKSI is a 1-on-1 deal-witnessing app for Indonesian informal commerce (fandom sales, jastip, kos deposits, personal loans). It records agreements, witnesses their lifecycle, and publishes truthful breach records. It is NOT an escrow (never holds transaction money), NOT a scam-accusation site, and NOT a notary.

**The invariant that overrides everything:** every string SAKSI shows must be true even when a user is lying to it. Copy is state-dependent; claims are attributed to claimants; absence of records never reassures; OCR says "konsisten", never "asli". When in doubt between a stronger claim and a weaker true one, ship the weaker true one.

## Stack (locked decisions — do not substitute)

- **Next.js 14+ App Router** on Vercel (free tier), TypeScript, Tailwind.
- **Supabase**: Postgres + Row Level Security, Storage (bukti uploads, private bucket), Edge Functions for webhooks. Free tier until it breaks.
- **Identity = phone number. No accounts, no email, no passwords.** E.164 normalized. Public clustering key = SHA-256(phone). Deal links are unguessable tokens (nanoid ≥ 21 chars).
- **OTP**: REMOVED entirely (§25, 2026-07-21) — its only call site was the breach-filing gate; identity there is now `identifyPartyByPhone` (proves party-to-deal, not phone possession). `lib/otp.ts` is deleted. Do not reintroduce without reading copy-id.md §25 first.
- **Payments**: Midtrans removed. No payment integration in the current product. Akun Saksi and Toko Saksi Pro fees are not yet collectable; tier upsell cards render inert with "Belum tersedia."
- **e-KYC**: Didit removed. No e-KYC integration in the current product.
- **e-Meterai** (Saksi Resmi, future): Rp30.000 per stamping per agreement. Buyer-initiated — the buyer chooses whether to apply meterai. One meterai per document, Rp30.000 official price (e-meterai via Peruri distributor integration). MOCK in demo with a clearly-labeled placeholder.
- **Integrity**: SHA-256 of canonical record JSON at EVERY state transition — live. OpenTimestamps anchoring is real code (`lib/db/anchor.ts`) but gated OFF behind `OTS_ANCHORING_ENABLED` pending an `ots verify` acceptance test that hasn't run (ops.md §44) — do not describe it as currently live.
- **Evidence pack**: server-side PDF (pdf-lib) following the IASC-accepted report format (see references/integrations.md §5) — spec'd, not yet built.

## Architecture rules

1. One deal = one record = one row in `deals`, with append-only `deal_events` capturing every transition (actor, timestamp, prior_hash, new_hash). Never UPDATE state history — only INSERT events; `deals.status` is a materialized latest-state. **One narrow, deliberate exception** (migration 0041, `cleanup_draf_deals()`): a DRAF deal that no counterpart ever opened was never witnessed by a second party, so it carries no agreement to protect — deleting its lone CREATED event does not touch what this rule exists to protect. The exception is scoped exactly that narrowly (`status = 'DRAF' and counterpart_id is null`, re-checked by the trigger itself against the live row, not trusted from the caller) and exists only to make the 7-day DRAF auto-delete promise (copy-id.md, privasi-retensi.md) actually true — it had silently never worked since migration 0003. Any deal a second party has ever engaged with remains permanently un-deletable, no exceptions.
2. All PII (phone, uploaded KTP artifacts, bukti images) lives behind RLS; public pages render only derived data: masked identifiers (0812••••34), counts, statuses, account age.
3. Flag/check pages are server-rendered from derived views — no raw PII in any client bundle or API response.
4. The copy-rekening button on the payer page MUST be disabled until the history card has rendered (the forced-check mechanic).
5. Every user-facing Indonesian string comes from `references/copy-id.md` — verbatim, no paraphrasing. If a needed string is missing, ask the user; do not invent legal-adjacent copy.
6. Rate-limit record creation (per phone-hash: 20/day) and identity-check attempts on every mutating action (10/15min per deal, per `lib/db/party.ts`) from day one. OTP no longer exists in this app — do not add OTP-specific rate limiting.

## Read next (required before coding the relevant area)

- `references/data-model.md` — full schema, the state machine (including D5 exit states and PERPANJANGAN), tier spec table, breach/flag logic. Read before touching the database or any flow.
- `references/copy-id.md` — every locked Indonesian string: 3-rung flag ladder, 4 attestation checkboxes, N8 refund warning, empty-state warning, tier cards, OTP message. Read before building any UI.
- `references/integrations.md` — WA OTP, OpenTimestamps, Gemini OCR, PDF evidence pack: exact config, sandbox notes, cost per call, failure handling. Read before wiring any external service.
- `references/ops.md` — live infrastructure facts, exact env var names, migration discipline, and the mandatory backup/keepalive Action. Read before proposing any infra, config, or deployment step.

## Build order (when starting from zero)

1. Schema + state machine + hash/anchor layer (the witness core).
2. Happy path: create deal → counterpart opens link → attestations → accept → payer forced-check page → bukti upload → OCR consistency → confirm → SELESAI.
3. D5 exit states + PERPANJANGAN.
4. Breach path: deadline lapse → reporter identified as deal party (no OTP) → notification + hak jawab window (14 days) → flag published at correct rung.
5. Public surfaces: check page, flag page, profile (counts per outcome — NEVER a score).
6. Saksi Resmi tier (e-meterai Rp30rb/perjanjian, buyer-initiated stamping + evidence-pack PDF).

Demo priorities if time is short: steps 1–2, PERPANJANGAN, the refund screen with the N8 warning, and the forced-check page with a sub-30-second create-to-accept stopwatch.
