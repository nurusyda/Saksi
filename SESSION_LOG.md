# SAKSI — Session Log

Running log of build sessions. Newest entry on top.

> **⚠ This log stops at 19 Jul 2026 and does not cover any of the major
> removals since (WA/Fonnte 2026-07-24, Midtrans and Didit e-KYC 2026-07-25,
> OTP from the breach path 2026-07-21 §25, the per-deal tier ladder collapsed
> to GRATIS-only migration 0039). Its own instruction below ("read this first
> ... to know exactly where things stand") is no longer accurate for current
> state — for that, read `ops.md` and `.claude/skills/saksi-builder/references/`
> instead. Kept here as a historical record of Sessions 1-3, not a live
> status doc.**

Read this first in any new chat or Claude Code session to know exactly where
things stood as of Session 3 (19 Jul 2026) — see the warning above for what's
changed since.

---

## Session 3 — 18 Jul 2026 (build step 2, slice 1 continued — fixes + copy audit)

### Blockers and warnings fixed
All six items were caught by monster_check runs (not the independent copy-audit pass;
see below for what the copy-audit found separately).

1. **Amount parsing** (`app/buat/actions.ts`): `parseInt` silently truncated
   non-integers (e.g. "10.5" → 10). Replaced with `Number(amountRaw)` +
   `Number.isFinite` + `Number.isInteger` check. Caught by monster_check (BLOCKER).

2. **Deadline timezone** (`app/buat/actions.ts`): `new Date(deadline)` compared
   against server local time — off by one day for WIB users on a UTC server.
   Fixed with string comparison: `new Date(Date.now() + 7*60*60*1000)
   .toISOString().slice(0,10)`. Caught by monster_check (BLOCKER).

3. **`formatDate` in deal page** (`app/deal/[token]/page.tsx`): One incorrect fix
   was proposed and rejected (`new Date(iso + 'T00:00:00+07:00')` — shifts to WIB
   midnight then renders in UTC default, so still off by one day). Correct fix:
   keep `new Date(iso)` (UTC midnight), add `timeZone: 'Asia/Jakarta'` to the Intl
   render options. Caught by monster_check (WARNING).

4. **Server-side attestation gate**: Both `createDeal` and `joinDeal` were missing
   server-side validation of the 4 attestation checkboxes + bundled T&C. Added gate
   before any field validation or DB write. Caught by monster_check (BLOCKER).

5. **Rate limit** (`createDeal`): No rate limit existed. Added 20 deals/proposer/UTC
   day. Keyed on `proposer_id` (the party UUID), not directly on `phone_hash` — but
   these are strictly equivalent because `parties.upsert` uses `onConflict:
   'phone_hash'`, guaranteeing one phone_hash maps to exactly one party.id
   permanently. Caught by monster_check (BLOCKER).

6. **`formatRp` type annotation** (`app/deal/[token]/page.tsx`): monster_check
   (static analysis) warned that `formatRp` might receive a `bigint` if Supabase
   returns `int8` as one, and that `Intl.NumberFormat.format()` throws on `bigint`.
   The specific TypeError was not reproduced at runtime. Documented Supabase/PostgREST
   behavior is the opposite: `int8` comes back as a plain JS `number` via JSON, with
   the real risk being silent precision loss on values above 2^53 — not a TypeError.
   The fix (`amount: number | bigint`, `Number(amount)` cast) is harmless as
   defensive typing and is kept, but the TypeError diagnosis is unverified. If
   `amount_idr` ever approaches 2^53 (Rp9 quadrillion+) the `Number()` cast would
   silently lose precision — not a current concern. Caught by monster_check (WARNING).

7. **PGRST116 vs. real RPC failure in `joinDeal`** (`app/deal/[token]/actions.ts`):
   `if (rpcErr || !updatedDealRow)` conflated two distinct failure modes — the real
   race condition (PGRST116: `.single()` got 0 rows because the deal was no longer
   in DRAF) and unrelated technical failures (network/DB error). Both showed
   "sudah tidak dapat dimasuki", blaming the deal being closed even when the cause
   was a system error. Fixed by splitting: `rpcErr.code === 'PGRST116'` → race
   message; any other `rpcErr` → `ERROR_JOIN_FAILED` ("Gagal bergabung. Coba lagi.").
   New string added to copy-id.md §12 and exported from lib/copy.ts.
   Caught by monster_check (WARNING), implemented same session.

### copy-id.md changes (all grammar/accuracy fixes, no product rewrites)
- **Attestation #3** (§3): Removed "penipuan" framing (inaccurate — data is processed
  for record-keeping, not fraud-pattern matching). Replaced with outcome-neutral:
  "menyusun riwayat kesepakatan saya (selesai, dibatalkan, diperpanjang, maupun
  tidak terpenuhi)." Propagated to `lib/copy.ts` ATTESTATIONS[2].
- **§5 TIDAK_KONSISTEN**: "beda" → "berbeda"
- **§1 Rung 2**: Added "melalui" before "mutasi bank" (grammatical)
- **§6 BERMETERAI**: "siap ajukan" → "siap diajukan"
- **§11 NEW — Landing tagline**: "Catat kesepakatan. Bukan rekening bersama, bukan
  jaminan pihak lain." Canonical source for both landing subheading and meta
  description; previously these two surfaces used different (inconsistent) strings.
- **§12 NEW — Deal state UI strings** (join flow):
  - Join form heading: "Masukkan nomor HP Anda untuk bergabung sebagai pihak
    penerima." (replaces "Pihak lain? Masukkan nomor HP Anda untuk bergabung."
    which was conditionally false for the proposer — no cookie/session exists to
    distinguish proposer from counterpart, so every viewer sees this form)
  - JOIN_DEAL_INSTRUCTION: "Nomor HP yang Anda masukkan akan tercatat sebagai pihak
    dalam kesepakatan ini. Centang semua pernyataan di bawah untuk melanjutkan."
  - STATUS_DIAJUKAN: "Kedua pihak tercatat. Menunggu persetujuan kedua pihak."

### Copy-audit findings (independent of monster_check)
A full scan of all inline Indonesian in `app/**/*.tsx` was run this session:
- **Finding 1 + 2 (FIXED)**: Landing subheading said "jual-beli" (too narrow —
  excludes jastip, kos deposits, personal loans) and diverged from the meta
  description. Both now use LANDING_TAGLINE from copy-id.md §11.
- **Finding 3 (FIXED)**: "Pihak lain?" heading on deal page was conditionally false
  for the proposer. Replaced with softer copy from §12.
- **Finding 4 (FIXED)**: String B (join form instruction) was improvised legal-adjacent
  copy. Approved wording formalized in §12.
- **Finding 5 (FIXED)**: String C (DIAJUKAN status line) was improvised. Approved
  wording formalized in §12.
- **Finding 6 (NO ACTION)**: "Semua kolom wajib diisi. Data Anda diproses sesuai
  persetujuan di bawah." — instructional UI chrome, not legal-adjacent. Actual data
  processing consent is in attestation #3. Confirmed low-stakes, no copy-id.md entry
  needed.

### Files changed this session (cumulative, not yet committed)
All files from Session 2 plus:
- `.claude/skills/saksi-builder/references/copy-id.md` — attestation #3,
  grammar fixes, §11, §12, §13 (role labels + pairings, counterpart
  helper strings, tier short labels)
- `lib/copy.ts` — ATTESTATIONS[2], TIER_BERMETERAI_DESC, LANDING_TAGLINE,
  JOIN_DEAL_INSTRUCTION, STATUS_DIAJUKAN, ERROR_SELF_JOIN,
  ERROR_DEAL_SAVE_FAILED, ERROR_JOIN_FAILED, ROLE_LABELS, ROLE_PAIR,
  ROLE_PAIR_HELPER_PREFIX, COUNTERPART_FALLBACK_LABEL, TIER_LABELS
- `app/layout.tsx` — meta description now uses LANDING_TAGLINE
- `app/page.tsx` — subheading now uses LANDING_TAGLINE
- `app/buat/page.tsx` — ROLE_LABELS + TIER_LABELS imported from copy.ts
  (no longer inline); ROLE_PAIR helper line wired under role selector
  (shows paired counterpart role on selection; hidden for LAINNYA); role
  taxonomy updated to PEMINJAM/PEMILIK/PENYEWA (PENERIMA_TITIPAN retired)
- `app/buat/actions.ts` — RPC call replaces two-step deal+event inserts;
  ERROR_DEAL_SAVE_FAILED used; validRoles updated to match new taxonomy
- `app/deal/[token]/page.tsx` — join form heading (Finding 3),
  JOIN_DEAL_INSTRUCTION, STATUS_DIAJUKAN applied; formatRp type annotation
  widened; formatDate timezone fix; ROLE_LABELS + TIER_LABELS imported from
  copy.ts; counterpart role display added to summary card using ROLE_PAIR +
  COUNTERPART_FALLBACK_LABEL (falls back to "Pihak lain" for LAINNYA)
- `app/deal/[token]/actions.ts` — RPC call replaces two-step update+event;
  TOCTOU comment at prior-hash fetch; PGRST116 rpcErr split so non-race
  failures return ERROR_JOIN_FAILED instead of the race-condition message
- `supabase/migrations/0004_atomic_deal_writes.sql` — NEW: atomic deal+event
  write functions (create_deal_with_event, join_deal_with_event), SECURITY
  INVOKER, race-safe via GET DIAGNOSTICS
- `supabase/migrations/0005_update_proposer_roles.sql` — NEW: updates
  deals.proposer_role CHECK constraint to match new role taxonomy
- `scripts/monster_check.py` — Law 3 updated: legally adjacent + cross-file
  duplicated strings require copy.ts; single-file UI chrome/validation may
  be inline
- `.github/workflows/backup.yml` — COMMITTED (e974a5d): write permission +
  orphan-branch first-run fix; confirmed end-to-end via workflow_dispatch

### Proposer/counterpart finding
`/deal/[token]/page.tsx` has no mechanism — no cookie, session, query param, or
auth — to distinguish the proposer from the counterpart. Everyone with the link sees
the same page including the join form. Additionally, `joinDeal` had no self-join
guard: proposer entering their own phone would set `counterpart_id = proposer_id`
(data integrity bug — hash chain records proposer as both parties).

**Server-action self-join guard**: Adding in this session; blocks the data integrity
bug at the action layer regardless of what the UI shows. Error message copy pending
approval before implementation (see Pending below).

**Cookie/visual distinction**: DEFERRED — see Deferred Decisions section below.
**Pihak Pertama/Kedua labeling**: DEFERRED alongside the cookie work — same
underlying gap (no session state to identify which party is viewing). The
ROLE_PAIR display upgrade shipped this session shows the counterpart's role by
inference from the proposer's role, but the Pihak Pertama/Kedua labels require
knowing which side the current viewer is on. See Deferred Decisions section.

### Pending as of this log
- monster_check: run multiple times this session; all 21 files staged.
  One more run pending after the PGRST116/ERROR_JOIN_FAILED fix.
- Commit: not yet made — pending final monster_check pass.

### Next action
1. Run `python3 scripts/monster_check.py` on current staged diff
2. If clean: `git commit` + `git push`
3. Scope decision: slice 2 (attestation-accept flow into DISEPAKATI)

---

## [DEFERRED] Rate-limit check-then-act race in `createDeal`

**What:** In `app/buat/actions.ts`, the rate limit SELECT count(*) and the
subsequent INSERT (inside `create_deal_with_event`) are two separate operations.
Two concurrent submissions from the same party can both pass the `count < 20`
check before either write lands, allowing a brief burst above the daily cap.

**Blast radius:** Small — the window is narrow and the threshold is 20/day, not
a per-second limit. Not a correctness or integrity issue; a deal created over the
limit is otherwise valid.

**Required fix:** Move the count check inside `create_deal_with_event` as:
`SELECT count(*) FROM deals WHERE proposer_id = p_proposer_id
AND created_at::date = current_date` with `FOR UPDATE` so the count and the
INSERT are serialized within the same PL/pgSQL transaction.

**Implement at:** Strict rate-limit hardening pass (future slice).

---

## [DEFERRED] Proposer/counterpart visual distinction on deal page

**What:** When the proposer follows their own redirect to `/deal/[token]` after
creating a deal, they see the join form ("Masukkan nomor HP Anda untuk bergabung...").
A cookie approach would let the page hide the join section for the proposer and show
"Menunggu pihak lain membuka link ini." instead.

**Why deferred:** A cookie set in a Server Action and read in a Server Component is
the app's first session state. Should be a deliberate architectural choice, not an
incidental add.

**Mitigation in place:** Join form heading softened (no longer addresses the viewer
as "Pihak lain?"). Server action guard blocks the data integrity bug regardless.

**Proposed implementation:**
- `createDeal` sets `Set-Cookie: saksi_proposer_[token]=1; HttpOnly; Secure;
  SameSite=Strict; Max-Age=3600` before `redirect()`
- `app/deal/[token]/page.tsx` reads cookie via `cookies()` from `next/headers`
- If cookie present: hide join section, render "Menunggu pihak lain membuka link ini."

**Naming decision (made this session):** When the cookie work is implemented, label
proposer as "Pihak Pertama" and counterpart as "Pihak Kedua" in the UI. Tied to
order of action (whoever fills the form first), not to commercial role — consistent
regardless of whether the initiator is buyer, seller, or lender. Implementation
note: display-label mapping only (PIHAK_PERTAMA when actor=PROPOSER, PIHAK_KEDUA
when actor=COUNTERPART); proposer_role (PENJUAL/PEMBELI/etc.) stays as a separate
field for transaction role, no schema change needed.

**Open question (not yet decided):** Fallback behavior when the cookie is
missing/expired (second device, expired 1hr window) and viewer identity is unknown.
Options: (a) neutral fallback — "pihak lain"-style language, (b) ask the viewer
directly which side they are. Leaning toward (a) but needs a real decision at
slice 2 scoping.

**Decision needed at:** slice 2 scoping.

---

## [DEFERRED] Prior-hash TOCTOU in `joinDeal`

**What:** In `app/deal/[token]/actions.ts`, the prior hash is fetched in a separate
`SELECT` from `deal_events` before the `join_deal_with_event` RPC call. A concurrent
event inserted between those two calls would cause the new hash to chain to a stale
prior, silently breaking chain integrity.

**Currently safe because:** A DRAF deal can only have a CREATED event. The RPC's
`WHERE status = 'DRAF'` guard means a losing concurrent join never inserts an event.
There is no other write path to `deal_events` for a DRAF deal.

**Becomes a live race when:** Any event type can be written to a deal that is not
yet in a terminal state while `joinDeal`'s fetch-then-RPC gap is open. PERPANJANGAN
is the first such case.

**Required fix at PERPANJANGAN implementation:**
- Add `p_expected_prior_hash text` parameter to `join_deal_with_event`.
- Inside the function, after the `GET DIAGNOSTICS` UPDATE check, fetch the actual
  latest `new_hash` from `deal_events` and compare to `p_expected_prior_hash`.
- If they differ: `RAISE EXCEPTION` (rolls back the whole transaction).
- TypeScript caller retries or surfaces a retriable error to the user.

**Comment placed:** `app/deal/[token]/actions.ts` at the prior-hash fetch, pointing
here.

---

## Session 2 — 18 Jul 2026 (build step 2, slice 1)

### Infra (all done, from session 1 + this session)
- saksi.app live on Vercel, DNS at Squarespace (A record only, nameservers NOT moved — email stays working)
- Supabase project `saksi-mvp`, region ap-southeast-1 (Singapore), linked via CLI
- Migrations 0001–0003 applied (schema, immutable events trigger, DRAF cleanup cron)
- pg_cron enabled
- `.env.local` fully populated (Supabase URL/anon/service-role, Gemini key)
- `SUPABASE_DB_URL` GitHub Actions secret set (session pooler, IPv4, port 5432)
- Local dev server (`npm run dev`) confirmed clean, no Supabase connection errors

### Build step 1 (schema + state machine + hash chain) — DONE, committed, pushed
Commit `a124acb`. 5 tables live: parties, deals, deal_events, bukti, flags
(+ 2 public views: deals_public, parties_public). Append-only trigger on
deal_events confirmed. OpenTimestamps stubbed (see decision below) —
`lib/db/anchor.ts` has `submitAnchor()`/`upgradeProof()` as no-op stubs
with a TODO; hash chain in Postgres is the real operational guarantee for
now, OTS is roadmap.

### Build step 2, slice 1 (create-deal form + share/join link) — IN PROGRESS
Scope: DRAF state (proposer form) + DIAJUKAN state (counterpart joins via
link, enters phone). Explicitly NOT in this slice: attestation-accept
flow into DISEPAKATI, OTP, payment, forced-check page (/cek).

Files created/modified this session (not yet committed as of this log):
- `lib/copy.ts` — NEW, canonical copy module. All locked strings from
  copy-id.md live here now (ATTESTATIONS, TC_LABEL, TIER_*_DESC,
  TIER_FOOTER, CANONICAL_DOMAIN). Every consuming file imports from here,
  no more inline duplication.
- `lib/db/hash.ts` — added `normalizePhone()`, `phoneHash()`
- `lib/db/transitions.ts` — added `CREATED` to `DealEventName`
- `lib/supabase/server.ts` — NEW, service-role client (server-only)
- `lib/supabase/client.ts` — NEW, anon client (browser-safe)
- `app/layout.tsx` — title/description → SAKSI, lang="id"
- `app/page.tsx` — landing page; imports CANONICAL_DOMAIN; /cek link
  disabled (span, aria-disabled, "(segera hadir)") since /cek doesn't
  exist yet
- `app/buat/actions.ts` — `createDeal` server action; nanoid(21) token;
  hash chain first event (CREATED, prior_hash null); uses
  `DealEventName.CREATED` constant (not bare string)
- `app/buat/page.tsx` — create-deal form; imports attestations/tiers
  from lib/copy.ts
- `app/deal/[token]/actions.ts` — `joinDeal` server action; hash chain
  second event (COUNTERPART_JOINED, prior_hash from last event)
- `app/deal/[token]/page.tsx` — share/join link page
- `app/deal/[token]/JoinDealForm.tsx` — imports attestations from
  lib/copy.ts (no more duplication)
- `app/deal/[token]/DealShareButton.tsx` — copy-link helper component

### Fixed this session
- Removed `opentimestamps` npm dependency (pulled in deprecated/vulnerable
  transitive deps incl. dummy `fs` package). Stubbed instead — see above.
- Downgraded `nanoid` from ^6.0.0 (Node 22+, ESM-only) to ^5.0.0 (CJS,
  Node 20 compatible)
- `scripts/monster_check.py` secret-scanner false positive on
  `env(VAR_NAME)` placeholder syntax in supabase/config.toml — added
  negative lookahead `(?!env\()` to `_secret_re()`
- Removed `analysis/forensic_audit.log` from git tracking + added to
  .gitignore. This file was NOT SAKSI's — it's a Stop hook from the
  GLOBAL `~/.claude/settings.json` (shared across all projects on this
  machine, originally written for the CaseFile/DFIR project) that fires
  on every Claude Code session end and appends a timestamp. Neutralized
  for this project specifically via a new `.claude/settings.json`
  (project-local, empty hooks) which overrides the global one.
  NOTE: the global `~/.claude/CLAUDE.md` (DFIR orchestrator persona) is
  still being loaded as context in every SAKSI session too, since it's
  global. Hasn't caused visible problems so far (Plan Mode still works
  normally) but worth knowing it's there.
- All em dashes removed from customer-facing copy (copy-id.md + 4 source
  files) — replaced with periods or commas depending on clause structure.
  Style rule saved to Claude Code's persistent memory: no em dashes in
  UI/JSX/user-facing text going forward.
- monster_check.py flagged 2 blockers + 2 warnings on the full UI batch:
  (1) locked copy was inline/duplicated instead of centralized → fixed
  via lib/copy.ts, (2) /cek link was dead (404) → fixed via disabled
  span, (3) createDeal used bare 'CREATED' string instead of
  DealEventName.CREATED constant → fixed, (4) attestations duplicated
  across 2 files → fixed by the same lib/copy.ts change as #1.
  Re-running monster_check.py after these fixes to confirm LGTM before
  commit — RESULT PENDING as of this log (was about to run when this
  log was written).

### Immediate next action
1. Run `python3 scripts/monster_check.py` (staged) — confirm LGTM
2. If clean: `git commit -m "..."` + `git push`
3. Then decide: continue same slice (nothing left — slice 1 scope is
   done pending the check) or move to slice 2 (attestation-accept flow,
   DISEPAKATI state) — this was not yet discussed/scoped

### Standing decisions/preferences (apply going forward)
- No em dashes anywhere in customer-facing copy (saved to Claude Code
  memory, but repeat if a new session seems to have forgotten)
- Manual edit approval (not auto mode) whenever a batch touches
  user-facing copy; auto/allow-all is fine for pure infra/plumbing files
- Business-persona skill files (data-analyst.md, growth-strategist.md,
  etc. — originally written for a different project, Jaga Eyang) were
  explicitly NOT ported into SAKSI. Reasoning: SAKSI's skill+monster_check
  loop already covers what those personas would duplicate; the
  business/growth personas assume phase boundaries and user cohorts SAKSI
  doesn't have yet at 1 week old. Scope-creep guard was added as one line
  in CLAUDE.md instead of a whole persona file.
- Two small pieces of copy were composed on the fly (not in copy-id.md
  originally): the layout.tsx meta description ("Catat kesepakatan.
  Bukan rekening bersama.") and the JoinDealForm intro text. Both judged
  low-risk (not legal-adjacent, not read as a claim about a specific
  deal) and approved as-is. Flagged for eventual promotion into
  copy-id.md as official strings, not urgent.

---

## Session 1 — 17–18 Jul 2026 (acquisitions + build step 1)

- All accounts acquired: saksi.app domain (Squarespace), sapa@saksi.app
  email, GitHub repo, Vercel, Supabase, Midtrans (sandbox pending prod
  application), Didit, Gemini API key
- saksi-builder skill (v3) installed at .claude/skills/saksi-builder/,
  containing SKILL.md + data-model.md + copy-id.md + integrations.md +
  ops.md — this is the single source of truth for all product decisions
  (tier spec, state machine, locked copy, stack choices)
- scripts/monster_check.py installed — DeepSeek-backed pre-commit
  reviewer, SAKSI-specific system prompt encoding the "Laws" (append-only
  ledger, PII behind RLS, locked copy, no verdicts about persons, OCR
  closed vocabulary, money-never-touches-SAKSI, forced-check mechanic)
- Build step 1 completed: schema, state machine (incl. D5 exit states),
  hash chain, OpenTimestamps stub, daily backup GitHub Action
  (.github/workflows/backup.yml, dumps DB to orphan branch, doubles as
  Supabase free-tier keepalive)
