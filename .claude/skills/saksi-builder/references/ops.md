# SAKSI Operations & Environment (facts Claude Code must not reinvent)

## Live infrastructure (as of 17 Jul 2026)

- **Repo**: github.com/nurusyda/Saksi (private), branch `main`. Next.js starter scaffolded with create-next-app (TypeScript, Tailwind, App Router).
- **Vercel**: project `saksi`, team `saksi` (Hobby). Domain **saksi.app** attached (A record @ → 216.198.79.1 at Squarespace DNS). NOTE: Hobby forbids commercial use — upgrade to Pro ($20/mo) is REQUIRED before enabling any paid tier. Free tier may ship on Hobby.
- **Supabase**: project `saksi-mvp`, region **ap-southeast-1 (Singapore)**, free plan. Free plan has NO backups and pauses after 7 days of inactivity — both are mitigated by the backup Action below, which is a week-one requirement, not optional.
- **Domain/DNS/email**: saksi.app registered at Squarespace; DNS stays at Squarespace (nameservers NOT moved to Vercel — moving them would break email). Email sapa@saksi.app is live; never propose DNS changes beyond single records, and never touch MX records.
- **OCR**: Gemini API (key exists, held locally). NOT Claude API.
- **OTP**: **REMOVED 2026-07-21 (§25)**. `lib/otp.ts` is deleted and no OTP is sent anywhere in the app. It had exactly one call site — the breach-report filing gate in `breachActions.ts` — and gating the wronged party's only recourse on a WhatsApp delivery meant a Fonnte outage blocked a real complaint from ever being recorded. Identity on those paths is now `identifyPartyByPhone` only (party-of-this-deal, re-derived server-side), which proves membership but NOT possession of the number; the consequences copy was corrected to stop claiming otherwise. The `otp_codes` table (migration 0020) is deliberately left in place — dropping a table is irreversible and an unused one costs nothing. If phone-possession proof is ever needed again (LIMA_RIBU/BERMETERAI, build step 6), build it against whatever channel is chosen then rather than reviving this. **WA itself is still wired** for best-effort, non-blocking turn-taking nudges and the deadline sweep: the prepaid number is registered with Fonnte, `FONNTE_API_KEY` is live in `.env.local`, and `lib/wa/send.ts` is a real Fonnte HTTP client including body-level response parsing (Fonnte returns HTTP 200 even on a rejected send). No user-visible string anywhere now claims a WA message was delivered. Fonnte remains a pre-launch swap candidate; Meta Cloud API is the longer-term target.
- **Flag publication**: built (build step 4 final phase, migration 0023) but gated behind `FLAGS_PUBLICATION_ENABLED` — do NOT set to `'true'` in Vercel until GATE 1 (lawyer review) clears. See `.claude/skills/saksi-builder/references/ops.md`'s env var table below and `app/api/cron/deadline-sweep/route.ts`'s `runFlagPublishBranch`.
- **Full transaction ledger + reputation-gaming signals**: built (per the design pass in `data-model.md`, confirmed 2026-07-20) but gated behind `LEDGER_DETAIL_ENABLED` — do NOT set to `'true'` until GATE 1 clears AND the §4A T&C clause (drafted in that same design pass) is actually applied to `content/legal/syarat-ketentuan.md`. No new migration — `lib/db/ledger.ts` is pure read-time aggregation over existing tables.
- **Migration 0029** (`deal_statements` + `record_dana_belum_masuk_with_event`) was applied to the live DB 2026-07-21 via `npx supabase db push` (this repo has no CI step that applies migrations — only `backup.yml`, which dumps, doesn't migrate — so this was a manual, one-time push). Confirmed via `supabase migration list` showing `remote: 0029`. Still true in general: do not assume any migration file in this repo is live in production without checking `migration list` first — this note is only evidence for 0029 specifically, not a standing guarantee about migrations added after it. Migrations 0030, 0031, 0032 were applied the same way; check `migration list` before assuming any later one is live.
- **OpenTimestamps anchoring** (§44, 2026-07-21): `lib/db/anchor.ts` is now a REAL implementation (was a `console.log` TODO stub) — it speaks the OTS calendar HTTP protocol directly and hand-builds the `.ots` bytes, dependency-free, because the maintained JS libraries pull `bitcore-lib` + the deprecated `request` chain (tough-cookie CVE) and adding a known-vulnerable dep to an integrity product is the wrong trade. **Gated OFF behind `OTS_ANCHORING_ENABLED`; do NOT set `'true'` until the acceptance test passes.** The code was written in a sandbox that could not reach the calendar servers, so the produced `.ots` bytes have never been checked against real `ots verify` tooling. Acceptance test before flipping: on a staging deal with the flag on, download the proof from `/api/ots/<new_hash>` and run `ots verify proof.ots` with the reference client; only if that passes does the flag go on in production. While off, `submitAnchor` is a silent no-op (no proof stored, `anchorStatusLabel` stays "Belum dijangkar"), so nothing user-facing claims OTS. The operational integrity guarantee remains the SHA-256 hash chain, which is real and test-verified — OTS is *additional external* attestation, not the core guarantee. ⚠ CLAUDE.md's stack line ("SHA-256 + OpenTimestamps on every state transition") describes the intended architecture, not the current live state: until this flag is on and verified, only the SHA-256 half is live. Do not repeat the OTS half as a current claim in any user-facing or marketing copy.
- **Midtrans**: sandbox account exists; keys not yet retrieved. Not needed until build step 6. Never propose manual/personal QRIS collection as an interim — rejected decision.

## Environment variable names (use exactly these)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only; never NEXT_PUBLIC_, never in client bundles
GEMINI_API_KEY=                   # server-only
MIDTRANS_SERVER_KEY=              # server-only, sandbox first
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=
CRON_SECRET=                      # server-only; verifies Vercel Cron -> /api/cron/deadline-sweep
FLAGS_PUBLICATION_ENABLED=        # server-only; unset/anything but 'true' = publication sweep branch
                                   # is a no-op. Gates GATE 1 (lawyer review) -- do NOT set to 'true'
                                   # until that review has cleared. See migration 0023.
OTS_ANCHORING_ENABLED=           # server-only; unset/anything but 'true' = submitAnchor is a silent
                                   # no-op. Do NOT set 'true' until the .ots acceptance test passes
                                   # (download /api/ots/<hash>, run `ots verify`). See §44 above.
LEDGER_DETAIL_ENABLED=            # server-only; unset/anything but 'true' = the "Lihat detail lengkap"
                                   # expand never renders and lib/db/ledger.ts's fetch functions
                                   # short-circuit to {status:'disabled'}. Gates GATE 1 + the §4A T&C
                                   # clause (data-model.md's ledger design pass) -- do NOT set to 'true'
                                   # until both clear.
```

Local: `.env.local` (already gitignored by create-next-app defaults — verify before first commit that adds it). Production: Vercel → Settings → Environment Variables; adding a var requires a redeploy to take effect.

## Database change discipline

- **All schema changes are migration files** in `supabase/migrations/*.sql`, managed via Supabase CLI, committed to git. NEVER create or alter tables through the dashboard — a product about auditable records does not have an unauditable schema.
- Migration files are append-only in spirit: fix-forward with a new migration rather than editing an applied one.
- `deal_events` is append-only at the database level: enforce with a trigger or revoked UPDATE/DELETE privileges, not just application convention.

## Backup + keepalive (week-one requirement — the ledger paradox)

OpenTimestamps proves a hash existed; it does not preserve the record. On the free plan (no backups, 7-day pause) SAKSI could end up able to prove its testimony existed while unable to produce it. Therefore:

- **GitHub Action, daily cron**: `supabase db dump` → commit to a private backup repo (or an orphan branch of the main repo). This is simultaneously the backup AND the keepalive (the dump is database activity, resetting the 7-day inactivity clock).
- Secrets needed by the Action: `SUPABASE_DB_URL` (or project ref + access token) stored as GitHub Actions secrets, never in the workflow file.
- Storage bucket (bukti images) is NOT covered by a db dump — add object storage sync to the backup job before real bukti exist in production.

## Working agreements for Claude Code sessions

- Copy strings come from `references/copy-id.md` verbatim; if a needed string is missing, STOP and ask — never improvise legal-adjacent Indonesian copy.
- Prefer plan-then-execute for anything touching schema, state machine, or public-facing copy.
- Keep diffs small and committed frequently; the human operator is learning the stack — narrate what matters, skip what doesn't.
- Output brevity: report only what needs human judgment — warnings, flags, design decisions, deviations from the agreed plan, and the final diff/result. Skip narrating routine steps. No "now checking X" preamble — just the finding, or silence if there's nothing to flag.
