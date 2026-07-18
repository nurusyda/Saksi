#!/usr/bin/env python3
"""
monster_check.py  -  Senior engineer pre-commit review for SAKSI.

Captures staged git changes, ships them to DeepSeek for rigorous review,
and streams a colorized verdict to the terminal. Run right before `git commit`.

SAKSI is a Next.js/TypeScript project, so unlike previous versions of this
tool the compile gate is `tsc --noEmit` (project-wide) and the deterministic
auto-context checks verify SAKSI's truth-conditions invariants instead of
Python-specific rules.

Usage:
    export DEEPSEEK_API_KEY="sk-..."
    git add <files>
    python3 scripts/monster_check.py            # review staged diff
    python3 scripts/monster_check.py --unstaged # review unstaged changes
    python3 scripts/monster_check.py --all      # staged + unstaged combined
    python3 scripts/monster_check.py --deep     # full audit: all ts/tsx/sql 2 at a time
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import subprocess
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# ANSI color helpers
# --------------------------------------------------------------------------- #
class C:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    GREY = "\033[90m"


def supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if not sys.stdout.isatty():
        return False
    return True


if not supports_color():
    for _attr in list(vars(C)):
        if not _attr.startswith("_") and _attr.isupper():
            setattr(C, _attr, "")


def banner(text: str, color: str = C.CYAN) -> None:
    bar = "═" * max(60, len(text) + 4)
    print(f"\n{color}{C.BOLD}{bar}{C.RESET}")
    print(f"{color}{C.BOLD}  {text}{C.RESET}")
    print(f"{color}{C.BOLD}{bar}{C.RESET}\n")


def die(msg: str, code: int = 1) -> None:
    print(f"{C.RED}{C.BOLD}[monster_check] FATAL:{C.RESET} {msg}", file=sys.stderr)
    sys.exit(code)


# --------------------------------------------------------------------------- #
# Git diff capture
# --------------------------------------------------------------------------- #
def run_git(args: list[str]) -> str:
    try:
        result = subprocess.run(
            ["git", *args], capture_output=True, text=True, check=False
        )
    except FileNotFoundError:
        die("`git` is not installed or not on PATH.")
    if result.returncode != 0:
        die(f"git {' '.join(args)} failed:\n{result.stderr.strip()}")
    return result.stdout


def ensure_git_repo() -> None:
    if run_git(["rev-parse", "--is-inside-work-tree"]).strip() != "true":
        die("Not inside a git repository. cd into ~/saksi first.")


def repo_root() -> Path:
    return Path(run_git(["rev-parse", "--show-toplevel"]).strip())


def capture_diff(mode: str) -> tuple[str, str]:
    if mode == "staged":
        diff = run_git(["diff", "--cached", "--no-color", "-U5"])
        files = run_git(["diff", "--cached", "--name-status"]).strip()
        label = "STAGED CHANGES (git diff --cached)"
    elif mode == "unstaged":
        diff = run_git(["diff", "--no-color", "-U5"])
        files = run_git(["diff", "--name-status"]).strip()
        label = "UNSTAGED CHANGES (git diff)"
    elif mode == "all":
        diff = run_git(["diff", "HEAD", "--no-color", "-U5"])
        files = run_git(["diff", "HEAD", "--name-status"]).strip()
        label = "ALL UNCOMMITTED CHANGES (git diff HEAD)"
    else:
        die(f"Unknown diff mode: {mode}")
    return diff, f"{label}\n{files or '(no files)'}"


def _changed_files(mode: str, exts: tuple[str, ...] | None = None) -> list[str]:
    if mode == "staged":
        name_status = run_git(["diff", "--cached", "--name-status"])
    elif mode == "unstaged":
        name_status = run_git(["diff", "--name-status"])
    else:
        name_status = run_git(["diff", "HEAD", "--name-status"])
    files = []
    for line in name_status.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0] != "D":
            f = parts[-1]
            if exts and not f.endswith(exts):
                continue
            files.append(f)
    return files


# --------------------------------------------------------------------------- #
# Compile gate: tsc --noEmit (project-wide; TS errors are cross-file)
# --------------------------------------------------------------------------- #
def compile_check(mode: str) -> str:
    changed_ts = _changed_files(mode, exts=(".ts", ".tsx"))
    if not changed_ts:
        return "TYPE CHECK: no .ts/.tsx files modified — tsc skipped."
    try:
        r = subprocess.run(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            capture_output=True, text=True, check=False, timeout=180,
            cwd=repo_root(),
        )
    except subprocess.TimeoutExpired:
        return "TYPE CHECK: tsc timed out (>180s) — treat type-safety as UNVERIFIED."
    except FileNotFoundError:
        return "TYPE CHECK: npx not found — treat type-safety as UNVERIFIED."
    if r.returncode == 0:
        return ("TYPE CHECK (tsc --noEmit passed — the whole project type-checks; "
                "do NOT flag type errors the compiler already accepts):\n  OK")
    errors = (r.stdout + r.stderr).strip()
    # Only fail the gate on errors touching changed files; report the rest.
    changed_set = set(changed_ts)
    blocking = [ln for ln in errors.splitlines()
                if any(cf in ln for cf in changed_set)]
    if blocking:
        return ("TYPE CHECK (tsc errors in modified files — real blockers):\n  "
                + "\n  ".join(blocking[:40]))
    return ("TYPE CHECK (tsc errors exist but NOT in modified files — "
            "pre-existing debt, note but do not block this diff):\n  "
            + "\n  ".join(errors.splitlines()[:20]))


# --------------------------------------------------------------------------- #
# Secret scan (applies before anything is sent to the API)
# --------------------------------------------------------------------------- #
def _secret_re() -> "re.Pattern":
    return re.compile(
        r'(?:api[_-]?key|token|secret|password|service[_-]?role)\s*[:=]\s*["\'][^\s"\']{12,}["\']'
        r'|sk-[a-zA-Z0-9]{20,}'
        r'|eyJ[a-zA-Z0-9_-]{30,}\.[a-zA-Z0-9_-]{10,}'   # JWT-shaped (Supabase keys)
        r'|AIza[a-zA-Z0-9_-]{30,}'                        # Google API keys (Gemini)
        r'|ghp_[a-zA-Z0-9]{36}',
        re.IGNORECASE,
    )


# --------------------------------------------------------------------------- #
# Full file content for modified files
# --------------------------------------------------------------------------- #
def full_file_context(mode: str, max_bytes_per_file: int = 40_000) -> str:
    changed = _changed_files(mode)
    if not changed:
        return ""
    _SECRET_RE = _secret_re()
    sections = [
        "FULL FILE CONTENT (use this to verify imports, signatures, and "
        "surrounding context — do not contradict what you see here):"
    ]
    for f in changed:
        fp = Path(f)
        if not fp.exists():
            continue
        if fp.suffix in (".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2"):
            continue
        try:
            content = fp.read_text(encoding="utf-8", errors="replace")
            if _SECRET_RE.search(content) and ".env" not in f:
                die(f"Aborting: {f} appears to contain a secret. Remove it before review.")
            b = content.encode("utf-8")
            if len(b) > max_bytes_per_file:
                content = b[:max_bytes_per_file].decode("utf-8", errors="replace") + "\n... [truncated at 40KB]"
            sections.append(f"\n### {f} ###\n{content}")
        except OSError as exc:
            sections.append(f"\n### {f} ### [unreadable: {exc}]")
    return "\n".join(sections)


# --------------------------------------------------------------------------- #
# Auto-context: deterministic SAKSI invariant checks
# --------------------------------------------------------------------------- #
# Files where forbidden words legitimately appear (locked copy definitions,
# this script, docs). The scan flags occurrences OUTSIDE these.
COPY_SOURCE_ALLOWLIST = (
    "lib/copy-id.ts", "lib/copy.ts", ".claude/", "supabase/migrations/",
    "scripts/monster_check.py", "CLAUDE.md", "README",
)

# Locked sentences that legitimately contain otherwise-forbidden words.
LOCKED_EXCEPTIONS = (
    "bukan jaminan aman",                      # empty-state warning (§2)
    "Bukti yang saya unggah asli",             # forgery attestation (§3)
    "Cek keaslian catatan hanya di saksi.app", # canonical-domain line (§8)
    "bukan tingkat keamanan",                  # tier footer (§6)
)


def build_auto_context() -> str:
    facts: list[str] = []
    root = repo_root()

    def scan_files(patterns: list[str]) -> list[Path]:
        out: list[Path] = []
        for pat in patterns:
            out.extend(root.glob(pat))
        return [p for p in out if p.is_file() and "node_modules" not in str(p)]

    ui_files = scan_files(["app/**/*.ts", "app/**/*.tsx",
                           "components/**/*.ts", "components/**/*.tsx",
                           "lib/**/*.ts"])

    # ── 1. Forbidden-word scan (truth-conditions invariant) ──────────────
    forbidden = re.compile(
        r"\basli\b|\baman\b|\bterpercaya\b|bebas penipuan|terverifikasi aman",
        re.IGNORECASE,
    )
    hits: list[str] = []
    for fp in ui_files:
        rel = str(fp.relative_to(root))
        if any(rel.startswith(a) or a in rel for a in COPY_SOURCE_ALLOWLIST):
            continue
        try:
            for i, line in enumerate(fp.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if forbidden.search(line) and not any(exc in line for exc in LOCKED_EXCEPTIONS):
                    hits.append(f"  {rel}:{i}: {line.strip()[:120]}")
        except OSError:
            pass
    if hits:
        facts.append("FORBIDDEN-WORD SCAN — occurrences outside locked copy "
                     "(adjudicate: 'terverifikasi' modifying a FACT is legal; "
                     "modifying a PERSON is a BLOCKER):\n" + "\n".join(hits[:30]))
    else:
        facts.append("FORBIDDEN-WORD SCAN: clean — no 'asli'/'aman'/'terpercaya'/"
                     "'bebas penipuan' outside locked copy.")

    # ── 2. Server-secret leakage into client code ────────────────────────
    leak_hits: list[str] = []
    server_only = re.compile(r"SUPABASE_SERVICE_ROLE_KEY|GEMINI_API_KEY|MIDTRANS_SERVER_KEY")
    for fp in ui_files:
        rel = str(fp.relative_to(root))
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        is_client = '"use client"' in text[:500] or "'use client'" in text[:500]
        if is_client and server_only.search(text):
            leak_hits.append(f"  {rel}: server-only env var referenced in a client component")
        if re.search(r"NEXT_PUBLIC_\w*(SERVICE_ROLE|GEMINI|SERVER_KEY)", text):
            leak_hits.append(f"  {rel}: server secret exposed with NEXT_PUBLIC_ prefix")
    if leak_hits:
        facts.append("SECRET-EXPOSURE SCAN — VIOLATIONS (unconditional blockers):\n"
                     + "\n".join(sorted(set(leak_hits))))
    else:
        facts.append("SECRET-EXPOSURE SCAN: clean — no server secrets in client "
                     "components or NEXT_PUBLIC_ vars.")

    # ── 3. deal_events append-only enforcement in migrations ─────────────
    mig_files = sorted((root / "supabase" / "migrations").glob("*.sql")) \
        if (root / "supabase" / "migrations").exists() else []
    if mig_files:
        all_sql = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in mig_files)
        has_guard = bool(re.search(
            r"deal_events[\s\S]{0,600}?(revoke\s+(update|delete)|"
            r"create\s+trigger[\s\S]{0,200}?(update|delete)[\s\S]{0,200}?deal_events|"
            r"raise\s+exception)",
            all_sql, re.IGNORECASE))
        facts.append(
            f"MIGRATIONS: {len(mig_files)} file(s) in supabase/migrations/. "
            + ("deal_events append-only guard (trigger/REVOKE) FOUND."
               if has_guard else
               "  WARNING: no DB-level append-only guard on deal_events found — "
               "application convention alone does not satisfy ops.md.")
        )
        if re.search(r"\bupdate\s+deal_events\b|\bdelete\s+from\s+deal_events\b",
                     all_sql, re.IGNORECASE):
            facts.append("  [VIOLATION] a migration contains UPDATE/DELETE on deal_events.")
    else:
        facts.append("MIGRATIONS: supabase/migrations/ absent or empty — schema "
                     "must not be created via dashboard (ops.md discipline).")

    # ── 4. Score / stars / composite-rating scan (verdict-wearing-math) ──
    score_hits: list[str] = []
    score_re = re.compile(r"trust[_\s-]?score|rating\b|star(s)?\b|reputasi\s*score|skor", re.IGNORECASE)
    for fp in ui_files:
        rel = str(fp.relative_to(root))
        if any(a in rel for a in COPY_SOURCE_ALLOWLIST):
            continue
        try:
            for i, line in enumerate(fp.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                if score_re.search(line) and not line.strip().startswith("//"):
                    score_hits.append(f"  {rel}:{i}: {line.strip()[:120]}")
        except OSError:
            pass
    if score_hits:
        facts.append("SCORE SCAN — possible composite-score surfaces (a score is a "
                     "verdict wearing math; counts-per-outcome are legal, a single "
                     "number/stars is a BLOCKER):\n" + "\n".join(score_hits[:20]))
    else:
        facts.append("SCORE SCAN: clean — no score/stars/rating surfaces detected.")

    # ── 5. OCR closed-vocabulary check ───────────────────────────────────
    ocr_files = [fp for fp in ui_files if re.search(r"ocr|gemini|bukti", fp.name, re.I)]
    for fp in ocr_files:
        rel = str(fp.relative_to(root))
        try:
            text = fp.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        verdicts = set(re.findall(r"KONSISTEN|TIDAK_KONSISTEN|TIDAK_TERBACA", text))
        if verdicts:
            facts.append(f"OCR VOCAB: {rel} uses closed verdicts: {sorted(verdicts)}")
        if re.search(r'["\'](ASLI|TERVERIFIKASI|VALID|GENUINE)["\']', text):
            facts.append(f"  [VIOLATION] {rel}: OCR-adjacent code emits a verdict "
                         "outside the closed vocabulary.")

    # ── 6. Locked-copy drift: canonical strings present verbatim? ────────
    copy_module = next((p for p in [root / "lib" / "copy-id.ts", root / "lib" / "copy.ts"]
                        if p.exists()), None)
    sentinel_strings = [
        "Belum ada riwayat di SAKSI — ini bukan jaminan aman.",
        "Pengembalian dana tidak pernah memerlukan transfer tambahan dari Anda.",
        "Cek keaslian catatan hanya di saksi.app",
    ]
    if copy_module:
        text = copy_module.read_text(encoding="utf-8", errors="replace")
        missing = [s for s in sentinel_strings if s not in text]
        if missing:
            facts.append("LOCKED-COPY CHECK — sentinel strings MISSING from "
                         f"{copy_module.name} (must match copy-id.md verbatim):\n  "
                         + "\n  ".join(missing))
        else:
            facts.append(f"LOCKED-COPY CHECK: all sentinel strings present verbatim in {copy_module.name}.")
    else:
        facts.append("LOCKED-COPY CHECK: no lib/copy-id.ts found — UI strings must "
                     "come from a single locked module, not be scattered inline.")

    # ── 7. Test count (if a test runner exists) ──────────────────────────
    pkg = root / "package.json"
    if pkg.exists() and '"test"' in pkg.read_text(encoding="utf-8", errors="replace"):
        facts.append("TESTS: a test script exists in package.json (count not run — "
                     "run npm test yourself; do not assume a number).")

    if not facts:
        return ""
    return ("AUTO-VERIFIED REPO STATE (confirmed programmatically — do not "
            "contradict):\n" + "\n".join(facts))


# --------------------------------------------------------------------------- #
# System prompt — SAKSI senior engineer persona
# --------------------------------------------------------------------------- #
SYSTEM_PROMPT = """\
You are a principal engineer with 15 years of production TypeScript/Postgres
experience, specializing in products where a single wrong string is a legal
liability. You are doing a pre-commit code review for SAKSI. You are not a
linter. You are a human engineer who has watched trust products die from
overclaiming, and your job is to catch those failures before they ship.

Your default assumption is that the code is wrong until you can prove
otherwise. You do not give the benefit of the doubt. You do not praise effort.

═══════════════════════════════════════════════════════════════════════════
PROJECT CONTEXT
═══════════════════════════════════════════════════════════════════════════
Project: SAKSI — deal-witnessing web app for Indonesian informal commerce
(fandom sales, jastip, kos deposits, personal loans). Records agreements,
witnesses their lifecycle, publishes truthful breach records.
It is NOT an escrow (never holds transaction money), NOT a scam-accusation
site, NOT a notary.
Repo: github.com/nurusyda/Saksi · Machine: WSL2 Ubuntu, ~/saksi/
Stack: Next.js App Router + TypeScript + Tailwind on Vercel · Supabase
(Postgres + RLS + Storage, ap-southeast-1) · identity = phone, no accounts ·
SHA-256 + OpenTimestamps on every state transition · Gemini for OCR
consistency · Midtrans Snap (QRIS only on Rp5rb tier) · Didit e-KYC.

THE ONE INVARIANT (overrides everything):
  Every string SAKSI shows must be true even when a user is lying to it.
  Claims are attributed to claimants. Absence of records never reassures.
  OCR says "konsisten", never "asli". No scores, no "aman", no "terpercaya".
  When in doubt between a stronger claim and a weaker true one, the weaker
  true one is correct and the stronger one is a bug.

THE LAWS (architectural, not suggestions — each violation is a BLOCKER):
  Law 1: deal_events is append-only. No UPDATE, no DELETE, ever — enforced
         at the database level (trigger or REVOKE), not just convention.
         deals.status is a materialized latest-state, rebuilt from events.
  Law 2: PII stays behind RLS. parties.phone_e164, bukti.storage_path, and
         any KTP artifact are service-role-only. Public pages render ONLY
         derived data: masked identifiers (0812••••34), phone_hash, counts,
         statuses, account age. Raw PII in a client bundle, API response,
         or public view is an unconditional BLOCKER.
  Law 3: Copy is locked. Every user-facing Indonesian string comes from the
         canonical copy module matching references/copy-id.md VERBATIM.
         Inline Indonesian UI strings, paraphrased legal-adjacent copy, or
         improvised flag wording are BLOCKERs. Flag text is state-dependent
         (rung 0/1/2 x tier) — hardcoding one variant is a bug.
  Law 4: No verdicts about persons. Forbidden anywhere in UI applied to a
         party/profile/record: "aman", "terpercaya", "terverifikasi aman",
         "bebas penipuan", any composite score, stars, or safety colors
         (e.g. green check on a profile). "Terverifikasi" may only modify a
         FACT (nomor HP terverifikasi), never a person's character.
         Counts-per-outcome are the only legal aggregate.
  Law 5: OCR closed vocabulary. Verdicts are exactly KONSISTEN |
         TIDAK_KONSISTEN | TIDAK_TERBACA. The word "asli" must not appear
         in any OCR-adjacent string, log, prompt, or variable that surfaces
         to users. The Gemini prompt/schema must be constrained so the
         model cannot emit anything outside the vocabulary.
  Law 6: Money never touches SAKSI. The buyer→seller payment is never
         collected, held, or forwarded. Midtrans is for TIER FEES only.
         The Rp5rb tier is QRIS-only (enabled_payments: ["qris"]) —
         virtual accounts on that tier invert the margin and are FORBIDDEN.
  Law 7: The forced-check mechanic is load-bearing. The copy-rekening
         button MUST stay disabled until the history card has rendered,
         and the empty state MUST show the "bukan jaminan aman" warning.
         Softening, skipping, or making the empty state reassuring is a
         BLOCKER (trust-washing).

GOLDEN RULES (bitten-once rules):
  - Hash chain integrity: every deal_events insert computes new_hash over
    the canonical deal JSON INCLUDING prior_hash. Canonical JSON = stable
    key order, no whitespace, integer amounts, ISO-8601 dates. Any code
    that hashes non-canonical JSON produces unverifiable history.
  - Never block a user flow on OpenTimestamps anchoring — the Postgres
    hash is the operational check; OTS is async (queue/cron).
  - Deal links are unguessable tokens (nanoid >= 21 chars). Sequential or
    short IDs in URLs are a BLOCKER (enumeration = PII harvest).
  - Rate limits exist from day one: OTP 3/phone/hour, record creation
    20/phone-hash/day. Server-side, not client-side.
  - Fees are charged at DISEPAKATI and are non-refundable. Charging at any
    other state, or building refund paths for fees, contradicts locked T&C.
  - Webhooks (Midtrans, Didit) verify signatures and are idempotent by
    order_id/session_id. An unverified webhook handler is a BLOCKER.
  - DRAF records auto-delete after 7 days (PII hygiene). Declined DIAJUKAN
    records delete entirely — no public trace. Code that keeps them is a bug.
  - assert/console.log are not gates. Runtime validation is explicit
    if/throw. No PII in console.log, ever.

ESTABLISHED PATTERNS (verify before flagging — these look wrong but are locked):
  PATTERN 1 — The empty state warns instead of reassuring. "Belum ada
  riwayat di SAKSI — ini bukan jaminan aman." on a clean account is
  INTENTIONAL (anti trust-washing). Do not flag as bad UX.
  PATTERN 2 — TIDAK_KONSISTEN does not block the upload. A mismatched
  bukti is recorded WITH its mismatch — the mismatch itself is evidence.
  Do not flag "upload proceeds despite failed validation" as a bug.
  PATTERN 3 — The words "asli"/"aman" appear inside locked copy itself
  (forgery attestation "Bukti yang saya unggah asli...", empty-state
  "bukan jaminan aman", canonical-domain line, tier footer). Exact locked
  sentences are legal; the ban is on NEW strings applying them to parties.
  PATTERN 4 — Fee non-refundability is stated, not hidden. This is locked
  T&C, not a dark pattern. Do not flag.
  PATTERN 5 — Counterpart may be null on deals until the link is opened.
  DRAF-state deals with counterpart_id NULL are the designed shape.
  PATTERN 6 — One party may pay both fees, but OTP/e-KYC cannot be
  delegated. Payment-for-both code is legal; verification-for-both is not.

═══════════════════════════════════════════════════════════════════════════
WHAT YOU ACTUALLY REVIEW — in priority order
═══════════════════════════════════════════════════════════════════════════
1. DOES IT VIOLATE THE LAWS? Review first. Each is an unconditional BLOCKER.
2. DOES IT ACTUALLY WORK? If run right now, does it do what it claims?
   - Server/client component confusion (hooks in server components,
     secrets in client components, async client components).
   - Supabase queries that silently return null and are never checked.
   - RLS assumed but the query runs with the service role (bypasses RLS).
   - State-machine transitions that skip states or fire from wrong states.
   - Hash computed before the event row exists (ordering bugs).
   - Await missing on async calls; unhandled promise rejections in routes.
   - Timezone bugs: deadlines are dates in WIB context; naive Date math
     across UTC boundaries moves deadlines by a day.
3. DOES IT VIOLATE THE GOLDEN RULES?
4. SECURITY — exhaustive. This product's asset is a ledger people must
   not be able to falsify, enumerate, or leak:
   - IDOR: any deal/bukti/flag fetched by ID without verifying the caller
     is a party to it (token possession = authorization for deal pages;
     anything beyond derived data requires party verification).
   - Path traversal on storage paths; signed URLs with long expiry on
     private bukti; public bucket for anything PII.
   - SQL injection (raw supabase .rpc / sql template misuse).
   - Prompt injection: bukti images and user text reach Gemini — the OCR
     prompt must treat image content as data, never as instructions, and
     the response must be schema-validated before use.
   - Webhook forgery (missing signature verification).
   - Secrets in client bundles, logs, or error responses.
5. IS IT UNNECESSARILY COMPLEX? Simpler-but-equal wins. Complexity hides bugs.
6. DOES IT HOLD TOGETHER AS A SYSTEM? Contract drift between schema,
   state machine, copy module, and UI. A new state without copy, a copy
   string without a state, a flag rung the schema can't represent.

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════
## SUMMARY
One sentence. Must end with SAFE TO COMMIT, COMMIT WITH CAUTION, or DO NOT COMMIT.

## [BLOCKER]   ← one per finding, repeat header for each
File: `path/to/file.ts:LINE`
Category: <Law-Violation | Correctness | Golden-Rule | Security | Privacy | Copy | Complexity | Cohesion>
Issue: What is actually wrong. One sentence, specific.
Why it matters: What breaks if this ships. One sentence.
Fix: Exact code. Not a description — actual replacement code, 1-5 lines.

## [WARNING]   ← same structure, for non-fatal issues worth fixing
## [SIMPLIFY]  ← for complexity issues that are not bugs

## [LGTM]
Only real decisions worth calling out. Skip entirely if nothing genuinely good.

## VERDICT
One of:
  ✅ LGTM — safe to commit
  ⚠️  COMMIT WITH CAUTION — warnings only, no blockers
  ❌ DO NOT COMMIT — blockers present, fix first

═══════════════════════════════════════════════════════════════════════════
RULES
═══════════════════════════════════════════════════════════════════════════
- Cite file:line for every finding. No exceptions.
- Do not restate the diff. The author wrote it.
- Do not say "consider" or "you might want to". State findings as facts.
- Do not invent issues. If the diff is clean, say so in one sentence.
- Do not mention being an AI.
- If the diff is empty, say so and stop.
- Every [SIMPLIFY] must include a concrete simpler version.
- Never flag ESTABLISHED PATTERNS without reading full file context.
- You are reviewing a DIFF. When a changed file calls a function defined in
  a file NOT in the diff, you cannot see its real signature — downgrade any
  parameter-mismatch finding to WARNING with the note "(unable to verify —
  callee not visible in diff)". The AUTO-VERIFIED block is authoritative;
  do not contradict it.
- Indonesian copy review: your job is NOT to improve the Indonesian. It is
  to verify strings match the locked module. Style suggestions on locked
  copy are noise — omit them.
"""


# --------------------------------------------------------------------------- #
# DeepSeek streaming review
# --------------------------------------------------------------------------- #
def colorize_stream_chunk(chunk: str, state: dict) -> str:
    out_parts = []
    buf = state.get("buf", "") + chunk
    while "\n" in buf:
        line, buf = buf.split("\n", 1)
        out_parts.append(_color_line(line, state) + "\n")
    state["buf"] = buf
    return "".join(out_parts)


def _color_line(line: str, state: dict) -> str:
    stripped = line.lstrip()
    if stripped.startswith("## [BLOCKER]"):
        state["section"] = "blocker"
        return f"{C.RED}{C.BOLD}{line}{C.RESET}"
    if stripped.startswith("## [WARNING]"):
        state["section"] = "warning"
        return f"{C.YELLOW}{C.BOLD}{line}{C.RESET}"
    if stripped.startswith("## [SIMPLIFY]"):
        state["section"] = "simplify"
        return f"{C.BLUE}{C.BOLD}{line}{C.RESET}"
    if stripped.startswith("## [LGTM]"):
        state["section"] = "lgtm"
        return f"{C.GREEN}{C.BOLD}{line}{C.RESET}"
    if stripped.startswith("## SUMMARY"):
        state["section"] = "summary"
        return f"{C.CYAN}{C.BOLD}{line}{C.RESET}"
    if stripped.startswith("## VERDICT"):
        state["section"] = "verdict"
        return f"{C.MAGENTA}{C.BOLD}{line}{C.RESET}"
    if stripped.startswith("## "):
        state["section"] = "other"
        return f"{C.BOLD}{line}{C.RESET}"
    if "❌" in line or stripped.startswith("DO NOT COMMIT"):
        return f"{C.RED}{C.BOLD}{line}{C.RESET}"
    if "✅" in line or "LGTM" in stripped[:6]:
        return f"{C.GREEN}{line}{C.RESET}"
    if "⚠" in line or stripped.startswith("COMMIT WITH CAUTION"):
        return f"{C.YELLOW}{line}{C.RESET}"
    section = state.get("section")
    if section == "blocker":
        return f"{C.RED}{line}{C.RESET}"
    if section == "warning":
        return f"{C.YELLOW}{line}{C.RESET}"
    if section == "simplify":
        return f"{C.BLUE}{line}{C.RESET}"
    if section == "lgtm":
        return f"{C.GREEN}{line}{C.RESET}"
    return line


def review_diff(diff: str, summary: str, model: str, combined_context: str = "") -> None:
    try:
        from openai import OpenAI
    except ImportError:
        die("The `openai` package is not installed. Run: pip install --upgrade openai")

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        die("DEEPSEEK_API_KEY environment variable is not set.")

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

    context_block = (
        "## VERIFIED (do not re-litigate):\n" + combined_context + "\n\n"
        if combined_context else ""
    )
    user_message = (
        f"{context_block}{summary}\n\n"
        f"Review this diff. Cite file:line for every finding.\n\n"
        f"```diff\n{diff}\n```"
    )
    banner(f"MONSTER-CHECK · model={model} · streaming review", C.CYAN)

    try:
        stream = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            stream=True,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}},
            temperature=0.2,
        )
    except TypeError:
        try:
            stream = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                stream=True,
                temperature=0.2,
                extra_body={"thinking": {"type": "enabled"},
                            "reasoning_effort": "high"},
            )
        except Exception as e:
            die(f"DeepSeek API call failed (fallback): {e}")
    except Exception as e:
        die(f"DeepSeek API call failed: {e}")

    state: dict = {"buf": "", "section": None}
    saw_any_text = False
    try:
        for event in stream:
            if not event.choices:
                continue
            delta = event.choices[0].delta
            piece = getattr(delta, "content", None)
            if not piece:
                continue
            saw_any_text = True
            sys.stdout.write(colorize_stream_chunk(piece, state))
            sys.stdout.flush()
    except KeyboardInterrupt:
        print(f"\n{C.YELLOW}[monster_check] interrupted.{C.RESET}", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"\n{C.RED}[monster_check] stream error: {e}{C.RESET}", file=sys.stderr)
        sys.exit(2)

    tail = state.get("buf", "")
    if tail:
        sys.stdout.write(_color_line(tail, state))
        sys.stdout.flush()
    if not saw_any_text:
        die("DeepSeek returned an empty response. Check API key and model availability.")
    print()


# --------------------------------------------------------------------------- #
# Deep scan — all ts/tsx/sql files 2 at a time
# --------------------------------------------------------------------------- #
def deep_scan(model: str) -> None:
    root = repo_root()
    try:
        r = subprocess.run(
            ["git", "ls-files", "*.ts", "*.tsx", "supabase/migrations/*.sql"],
            capture_output=True, text=True, check=True, cwd=root,
        )
        files = sorted(
            f for f in r.stdout.splitlines()
            if "node_modules" not in f and not f.endswith(".d.ts")
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        files = sorted(
            f for f in glob.glob("**/*.ts*", recursive=True)
            if "node_modules" not in f and not f.endswith(".d.ts")
        )
    if not files:
        print("No .ts/.tsx/.sql files found.")
        return
    pairs = [files[i:i + 2] for i in range(0, len(files), 2)]
    total = len(pairs)
    print(f"{C.CYAN}{C.BOLD}DEEP SCAN: {len(files)} files -> {total} pairs{C.RESET}")
    auto_ctx = build_auto_context()
    _SECRET_RE = _secret_re()
    for idx, pair in enumerate(pairs, 1):
        banner(f"DEEP SCAN [{idx}/{total}]: {', '.join(pair)}", C.MAGENTA)
        sections = [
            f"DEEP SCAN [{idx}/{total}] — full file review. Review these complete "
            "files for correctness, security, Law violations, and system "
            "cohesion. These are NOT diffs — review the entire file content."
        ]
        for f in pair:
            fp = root / f
            if not fp.exists():
                sections.append(f"### {f} [NOT FOUND]")
                continue
            try:
                content = fp.read_text(encoding="utf-8", errors="replace")
                if _SECRET_RE.search(content):
                    print(f"{C.YELLOW}[skip] {f} contains possible secret; not sent.{C.RESET}")
                    continue
                sections.append(f"### {f} ###\n{content}")
            except OSError as exc:
                sections.append(f"### {f} [unreadable: {exc}]")
        payload = "\n\n".join(sections)
        if len(payload.encode("utf-8")) > 300_000:
            print(f"{C.YELLOW}[deep_scan] pair {idx}/{total} too large — skipping.{C.RESET}")
            continue
        review_diff(payload, f"DEEP SCAN [{idx}/{total}]: " + ", ".join(pair),
                    model, combined_context=auto_ctx)
        print()
    print(f"{C.GREEN}{C.BOLD}DEEP SCAN COMPLETE — {len(files)} files in {total} pairs.{C.RESET}")


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(
        prog="monster_check",
        description="Senior engineer pre-commit review for SAKSI (DeepSeek).",
    )
    diff_group = parser.add_mutually_exclusive_group()
    diff_group.add_argument("--unstaged", action="store_true",
                            help="Review unstaged working-tree changes.")
    diff_group.add_argument("--all", action="store_true", dest="all_changes",
                            help="Review staged + unstaged combined (git diff HEAD).")
    parser.add_argument("--model", default="deepseek-v4-pro",
                        help="Model id (default: deepseek-v4-pro).")
    parser.add_argument("--max-diff-bytes", type=int, default=400_000,
                        help="Refuse payloads larger than this (default 400 KB).")
    parser.add_argument("--diff-only", action="store_true",
                        help="Send ONLY the diff (skip full-file context).")
    parser.add_argument("--context", "-C", default="",
                        help="Verified context preamble to prepend.")
    parser.add_argument("--deep", action="store_true",
                        help="Full repo audit: all ts/tsx/sql files 2 at a time.")
    args = parser.parse_args()

    ensure_git_repo()

    if args.deep:
        deep_scan(args.model)
        sys.exit(0)

    mode = "unstaged" if args.unstaged else ("all" if args.all_changes else "staged")
    diff, summary = capture_diff(mode)
    if not diff.strip():
        die(f"No {mode} changes to review."
            + (" Run `git add <files>` first, or use --unstaged / --all." if mode == "staged" else ""),
            code=0)

    auto_facts = build_auto_context()
    compile_info = compile_check(mode)
    if "real blockers" in compile_info:
        print(compile_info)
        die("Type errors in modified files — fix before committing.")

    file_contents = "" if args.diff_only else full_file_context(mode)
    combined_context = "\n".join(filter(None, [
        compile_info, auto_facts, file_contents, args.context or ""
    ]))

    payload_bytes = len(diff.encode("utf-8")) + len(combined_context.encode("utf-8"))
    if payload_bytes > args.max_diff_bytes:
        die(f"Payload is {payload_bytes:,} bytes (limit {args.max_diff_bytes:,}). "
            f"Split the commit or raise --max-diff-bytes.")

    print(f"{C.GREY}{summary}{C.RESET}")
    review_diff(diff, summary, args.model, combined_context=combined_context)


if __name__ == "__main__":
    main()
