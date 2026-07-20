# SAKSI Operations & Environment (facts Claude Code must not reinvent)

## Live infrastructure (as of 17 Jul 2026)

- **Repo**: github.com/nurusyda/Saksi (private), branch `main`. Next.js starter scaffolded with create-next-app (TypeScript, Tailwind, App Router).
- **Vercel**: project `saksi`, team `saksi` (Hobby). Domain **saksi.app** attached (A record @ → 216.198.79.1 at Squarespace DNS). NOTE: Hobby forbids commercial use — upgrade to Pro ($20/mo) is REQUIRED before enabling any paid tier. Free tier may ship on Hobby.
- **Supabase**: project `saksi-mvp`, region **ap-southeast-1 (Singapore)**, free plan. Free plan has NO backups and pauses after 7 days of inactivity — both are mitigated by the backup Action below, which is a week-one requirement, not optional.
- **Domain/DNS/email**: saksi.app registered at Squarespace; DNS stays at Squarespace (nameservers NOT moved to Vercel — moving them would break email). Email sapa@saksi.app is live; never propose DNS changes beyond single records, and never touch MX records.
- **OCR**: Gemini API (key exists, held locally). NOT Claude API.
- **OTP**: built (build step 4, migration 0020) — `lib/otp.ts`, scoped to the breach-report filing call sites (`sendBreachReportOtp`/`sendDeadlineLapseOtp` in `breachActions.ts`). 6-digit, 5-minute expiry, hashed, single-use, 3 sends/phone/hour. Not yet a generic multi-purpose OTP module — LIMA_RIBU/BERMETERAI OTP (build step 6) is a different, not-yet-built call site; widen `otp_codes`' shape then rather than assuming it already covers it. The WA send channel is live: the dedicated prepaid number is registered with Fonnte, `FONNTE_API_KEY` is live in `.env.local`. `lib/wa/send.ts` is a real Fonnte HTTP client as of 2026-07-20 (deadline-sweep nudges), including body-level response parsing (Fonnte returns HTTP 200 even on a rejected send) — no longer a logging-only stub. Fonnte remains flagged as a pre-launch swap candidate; Meta Cloud API is the longer-term target.
- **Flag publication**: built (build step 4 final phase, migration 0023) but gated behind `FLAGS_PUBLICATION_ENABLED` — do NOT set to `'true'` in Vercel until GATE 1 (lawyer review) clears. See `.claude/skills/saksi-builder/references/ops.md`'s env var table below and `app/api/cron/deadline-sweep/route.ts`'s `runFlagPublishBranch`.
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
