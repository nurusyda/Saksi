---
name: saksi-builder
description: Build and extend SAKSI, an Indonesian deal-witnessing web app (mencatat kesepakatan jual-beli informal, flag wanprestasi, evidence pack). Use this skill whenever the user asks to build, code, scaffold, debug, or extend any part of SAKSI — the deal record flow, tier system (Gratis/Rp5rb/Bermeterai), OTP verification, bukti transfer upload/OCR, flag pages, check pages, state machine, payment integration, or evidence-pack PDF. Also use it when the user mentions "kesepakatan", "wanprestasi", "rekening check", "HnR", or SAKSI by name. This skill contains locked product decisions (copy strings, state machine, tier spec, legal constraints) that MUST be followed exactly — do not improvise alternative wording or states.
---

# SAKSI Builder

SAKSI is a 1-on-1 deal-witnessing app for Indonesian informal commerce (fandom sales, jastip, kos deposits, personal loans). It records agreements, witnesses their lifecycle, and publishes truthful breach records. It is NOT an escrow (never holds transaction money), NOT a scam-accusation site, and NOT a notary.

**The invariant that overrides everything:** every string SAKSI shows must be true even when a user is lying to it. Copy is state-dependent; claims are attributed to claimants; absence of records never reassures; OCR says "konsisten", never "asli". When in doubt between a stronger claim and a weaker true one, ship the weaker true one.

## Stack (locked decisions — do not substitute)

- **Next.js 14+ App Router** on Vercel (free tier), TypeScript, Tailwind.
- **Supabase**: Postgres + Row Level Security, Storage (bukti uploads, private bucket), Edge Functions for webhooks. Free tier until it breaks.
- **Identity = phone number. No accounts, no email, no passwords.** E.164 normalized. Public clustering key = SHA-256(phone). Deal links are unguessable tokens (nanoid ≥ 21 chars).
- **OTP**: WhatsApp authentication template (Meta Cloud API direct, or Fonnte for speed). ~Rp430/message. SMS only as fallback.
- **Payments**: Midtrans Snap. **QRIS ONLY for the Rp5rb tier** (0.7% MDR). Virtual account is FORBIDDEN on that tier (Rp4.000 flat fee = 80% of revenue). VA may be enabled for the Bermeterai tier only.
- **e-KYC**: Didit web SDK (sandbox first; 500 free full-KYC/month in production). Document+liveness+face-match only — this is NOT a Dukcapil check; never claim "terverifikasi Dukcapil".
- **e-Meterai**: MOCK in demo with a clearly-labeled placeholder ("Simulasi meterai — integrasi distributor Peruri pada rilis produksi"). One meterai per document, Rp10.000 official price.
- **Integrity**: SHA-256 of canonical record JSON at EVERY state transition, anchored via OpenTimestamps (free). Store hash + .ots proof alongside the record.
- **Evidence pack**: server-side PDF (pdf-lib) following the IASC-accepted report format (see references/integrations.md §5).

## Architecture rules

1. One deal = one record = one row in `deals`, with append-only `deal_events` capturing every transition (actor, timestamp, prior_hash, new_hash). Never UPDATE state history — only INSERT events; `deals.status` is a materialized latest-state.
2. All PII (phone, uploaded KTP artifacts, bukti images) lives behind RLS; public pages render only derived data: masked identifiers (0812••••34), counts, statuses, account age.
3. Flag/check pages are server-rendered from derived views — no raw PII in any client bundle or API response.
4. The copy-rekening button on the payer page MUST be disabled until the history card has rendered (the forced-check mechanic).
5. Every user-facing Indonesian string comes from `references/copy-id.md` — verbatim, no paraphrasing. If a needed string is missing, ask the user; do not invent legal-adjacent copy.
6. Rate-limit OTP sends (per phone: 3/hour) and record creation (per phone-hash: 20/day) from day one.

## Read next (required before coding the relevant area)

- `references/data-model.md` — full schema, the state machine (including D5 exit states and PERPANJANGAN), tier spec table, breach/flag logic. Read before touching the database or any flow.
- `references/copy-id.md` — every locked Indonesian string: 3-rung flag ladder, 4 attestation checkboxes, N8 refund warning, empty-state warning, tier cards, OTP message. Read before building any UI.
- `references/integrations.md` — Midtrans, WA OTP, Didit, OpenTimestamps, PDF evidence pack: exact config, sandbox notes, cost per call, failure handling. Read before wiring any external service.
- `references/ops.md` — live infrastructure facts, exact env var names, migration discipline, and the mandatory backup/keepalive Action. Read before proposing any infra, config, or deployment step.

## Build order (when starting from zero)

1. Schema + state machine + hash/anchor layer (the witness core).
2. Free-tier happy path: create deal → counterpart opens link → attestations → accept → payer forced-check page → bukti upload → OCR consistency → confirm → SELESAI.
3. D5 exit states + PERPANJANGAN.
4. Breach path: deadline lapse → reporter OTP (free, we pay) → notification + hak jawab window (14 days) → flag published at correct rung.
5. Public surfaces: check page, flag page, profile (counts per outcome — NEVER a score).
6. Rp5rb tier (QRIS payment + both-party OTP) → Bermeterai tier (Didit sandbox + meterai mock + evidence-pack PDF).

Demo priorities if time is short: steps 1–2, PERPANJANGAN, the refund screen with the N8 warning, and the forced-check page with a sub-30-second create-to-accept stopwatch.
