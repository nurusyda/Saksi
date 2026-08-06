# Secret and History Audit

**Date:** 2026-08-06
**Tool:** gitleaks 8.30.1
**Scope:** all 17 repositories under `github.com/nurusyda` — no sampling

## Method

Each repository was scanned twice:

- **Full history** — `gitleaks git . --log-opts="--all"`, covering every branch
  and tag rather than HEAD only.
- **Working tree** — `gitleaks dir .`, covering untracked and gitignored files
  that never entered history.

The audit was run **before** any repository visibility change. Making a
repository private does not un-leak a credential already published, and it
removes the ability to scan it in context.

## Results

| | Count |
|---|---|
| Repositories scanned | 17 |
| Repositories with findings | 2 |
| Raw findings | 7 |
| False positives | 5 |
| Live credentials found | 2 |
| Credentials remediated | 2 |
| History rewrites performed | 0 |

### False positives (5)

`generic-api-key` matches on SHA digests — three in a hash-verification output
file, two in test assertions. Entropy 3.9–4.5. A hash and an API key have the
same entropy profile, which is what this rule keys on. Each was compared by
hand against live credentials; none matched. Suppressed by fingerprint in
`.gitleaksignore` with a per-entry justification.

### Live credentials (2)

One repository, public since 2026-02-28, contained a committed `.env`:

- Committed `39f0c0c` — 2026-03-10T20:25Z, message "Local save before sync"
- Removed from working tree `70d831b` — 2026-03-11T07:23Z, message
  "SECURITY: Removing exposed secrets and private backups"

**Working-tree exposure: ~11 hours. Public history exposure: 149 days.**

The remediation at the time addressed the working tree only. Both credentials
remained retrievable from public history until this audit. This is the failure
mode the audit was designed to catch: deleting a file is not revoking a
credential, and a HEAD-only scan would have reported the repository clean.

| Credential | Status |
|---|---|
| Amazon Nova API key | Confirmed revoked at provider |
| ngrok authtoken | Confirmed absent from account |

## Decisions

**History was not rewritten.** For a repository public for 149 days, assume the
values were scraped. Rotation is the remediation; `git filter-repo` is cosmetic
once exposure has occurred, and it invalidates every existing clone and
reference. The history is left legible.

**Findings are suppressed, not deleted.** `.gitleaksignore` entries record
disposition — false positive or remediated — so the record stays auditable.

## Prevention

- gitleaks runs in CI on each maintained repository, with a non-zero exit on
  new findings.
- `.env` is gitignored in the shared project template.

The root cause was a catch-all commit, not a deliberate one. The control is at
the `.gitignore` layer, before a bulk `git add` can reach it.
