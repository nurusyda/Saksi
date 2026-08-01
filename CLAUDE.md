# SAKSI

Deal-witnessing web app for Indonesian informal commerce (fandom sales, jastip, kos deposits, personal loans). Records agreements, witnesses their lifecycle, publishes truthful breach records. NOT an escrow, NOT a scam-accusation site, NOT a notary.

## Before doing anything

Read `.claude/skills/saksi-builder/SKILL.md` and its `references/` files:
- `references/data-model.md` — schema, state machine, tier spec, breach/flag logic (read before touching the database or any flow)
- `references/copy-id.md` — every locked Indonesian string, VERBATIM, no paraphrasing (read before building any UI)
- `references/integrations.md` — WA OTP, OpenTimestamps, Gemini OCR, evidence-pack PDF (read before wiring any external service)
- `references/ops.md` — live infrastructure facts, env var names, migration discipline, backup requirement (read before proposing any infra or config)

These contain LOCKED product decisions. Do not improvise alternative wording, states, tiers, or stack choices. If something needed is missing from them, ask the human — do not invent.

## The one invariant

Every string SAKSI shows must be true even when a user is lying to it. Claims are attributed to claimants; absence of records never reassures; OCR says "konsisten", never "asli"; no scores, no "aman", no "terpercaya". When in doubt between a stronger claim and a weaker true one, ship the weaker true one.

## Stack (locked)

Next.js App Router + TypeScript + Tailwind on Vercel · Supabase (Postgres/RLS/Storage, project in ap-southeast-1) · identity = phone (no accounts/emails/passwords) · SHA-256 + OpenTimestamps on every state transition · Gemini for OCR consistency.

## Build order

1. Schema + state machine + hash/anchor layer (migrations in `supabase/migrations/`, via CLI, committed)
2. Standard happy path: create → link → attestations → accept → forced-check → bukti upload → OCR → SELESAI
3. D5 exit states + PERPANJANGAN
4. Breach path (identify, not OTP — §25 removed OTP from breach path)
5. Public surfaces: check page, flag page, profile (counts, never a score)
6. Paid tiers (Akun Saksi Rp20rb one-time, Toko Saksi Pro Rp200rb/year, Saksi Resmi e-meterai Rp30rb/perjanjian — buyer-initiated stamping)

Week-one non-negotiable alongside step 1: the daily `supabase db dump` GitHub Action (backup + keepalive) — see ops.md.

## Language

UI is Bahasa Indonesia (strings from copy-id.md). Code, comments, commit messages in English.
