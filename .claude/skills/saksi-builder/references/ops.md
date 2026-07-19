# SAKSI Operations & Environment (facts Claude Code must not reinvent)

## Live infrastructure (as of 17 Jul 2026)

- **Repo**: github.com/nurusyda/Saksi (private), branch `main`. Next.js starter scaffolded with create-next-app (TypeScript, Tailwind, App Router).
- **Vercel**: project `saksi`, team `saksi` (Hobby). Domain **saksi.app** attached (A record @ → 216.198.79.1 at Squarespace DNS). NOTE: Hobby forbids commercial use — upgrade to Pro ($20/mo) is REQUIRED before enabling any paid tier. Free tier may ship on Hobby.
- **Supabase**: project `saksi-mvp`, region **ap-southeast-1 (Singapore)**, free plan. Free plan has NO backups and pauses after 7 days of inactivity — both are mitigated by the backup Action below, which is a week-one requirement, not optional.
- **Domain/DNS/email**: saksi.app registered at Squarespace; DNS stays at Squarespace (nameservers NOT moved to Vercel — moving them would break email). Email sapa@saksi.app is live; never propose DNS changes beyond single records, and never touch MX records.
- **OCR**: Gemini API (key exists, held locally). NOT Claude API.
- **OTP**: deferred until build step 4. A dedicated prepaid number exists, not yet registered with any provider. Fonnte is the fast path (flagged as pre-launch swap candidate); Meta Cloud API is the target. Do not build OTP earlier than the breach path needs it.
- **Midtrans**: sandbox account exists; keys not yet retrieved. Not needed until build step 6. Never propose manual/personal QRIS collection as an interim — rejected decision.

## Environment variable names (use exactly these)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-only; never NEXT_PUBLIC_, never in client bundles
GEMINI_API_KEY=                   # server-only
MIDTRANS_SERVER_KEY=              # server-only, sandbox first
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=
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
