# SAKSI — Tier B Build Plan

Tier B = the breach pipeline goes live: laporan filing, hak jawab, publication, and public check pages — the actual point of the product. Plus the WA/OTP infrastructure everything above depends on.

**What makes Tier B different from Tier A:** Tier A's output was records visible only to the two parties. Tier B's output is **published statements about real, identifiable people** that third parties will read and act on. Every phase here carries defamation-adjacent risk that Tier A never did. The truth-conditions rule ("true in every possible world") stops being philosophy and becomes the legal defense. Copy review gets stricter, not looser, from here.

**Two hard gates that are NOT code and cannot be skipped:**

- **GATE 1 — Lawyer review before any flag is publicly visible.** Standing decision from earlier sessions. A qualified Indonesian lawyer reads: the flag ladder copy, the publication mechanism, the T&C §4 consent argument (acceptance-with-hash as legal basis under UU PDP), and the hak jawab flow. Build everything behind a feature flag; nothing publishes until this clears.
- **GATE 2 — PSE Kominfo filing submitted before rollout.** Distribution stays Option A (invite-only, direct links, no public promotion, no discovery surface) until PSE clears. The public check pages are exactly the kind of "discovery surface" Option A excludes — so even after they're built, they stay unlinked/unindexed (noindex, no homepage entry point) until both gates clear.

---

## Phase B0 — Real WhatsApp client (prerequisite for everything)

The sweep's `lib/wa/send.ts` is an interface stub. Tier B's laporan flow requires OTP, which requires actual message delivery.

**Decision made: Fonnte.** (Meta Cloud API status wasn't re-checked before committing to this — worth a note that the swap-to-Meta debt is still technically open, per the original standing plan, just not urgent.)

**Setup completed (operational, not code):**
- Dedicated WA Business number acquired — deliberately **not** the existing personal/business number. Reasoning worth preserving: Fonnte connects via WhatsApp's linked-device mechanism (same as WhatsApp Web), which is unofficial automation in WhatsApp's terms. Every source on this is consistent — unauthorized automation is a leading cause of bans, and a ban takes the whole number down, not just the automated feature. Isolating this to a disposable number means a worst-case ban only costs SAKSI's sending capability, never a real business relationship.
- Display name set to the locked "SAKSI (saksi.app)" (copy-id.md §9).
- Fonnte device created, Chatbot mode ON (API-driven, not manual-reply), Personal/Group auto-reply OFF (not needed — SAKSI only does one-way transactional sends).
- QR-linked successfully, confirmed Active in WhatsApp's Linked Devices screen.
- `FONNTE_API_KEY` and `GEMINI_API_KEY` both in Vercel (Sensitive, Production + Preview) and `.env.local`.

**New operational risk, worth carrying into ops.md:** Fonnte's linked-device architecture means the *origin phone* (the one that scanned the QR) must stay powered on and connected to the internet indefinitely — if it goes offline for too long, the session can drop silently, and OTP/nudge sending stops with no obvious error surfaced anywhere in the app. This is a live-infrastructure dependency, not a one-time setup step. Needs a permanent home (charging, on wifi) and ideally a monitoring/alerting note for later — if this session drops in production, it's the kind of failure that wouldn't show up until someone notices OTPs aren't arriving.

**Package limit to track:** Fonnte's free tier is capped (1,000 messages, expires 19 Aug 2026 as of setup). Fine for B1/B2 testing volume; needs a paid package before real usage. Add a reminder before that date.

Scope still open (code, not yet built):
- Implement the real HTTP client behind the existing `sendWaMessage(phoneE164, templateName, params)` signature — do not change the signature; the sweep already calls it.
- Two template categories: AUTHENTICATION (OTP, fixed template from copy-id.md §9) and UTILITY (nudge + laporan notifications).
- Delivery-failure handling: log, don't throw — a failed send must never corrupt a deal's state (same non-blocking rule the sweep plan already established).
- Cost note for ops: ~Rp367–430/message equivalent via Fonnte's package pricing. OTP costs are absorbed by SAKSI (breach filing is free at every tier — that's locked copy, not negotiable).

> **Claude Code prompt (ready to send — credentials are live):**
> FONNTE_API_KEY is live in Vercel and .env.local, connected to a dedicated WA Business number ("SAKSI (saksi.app)"), separate from any personal/existing business number. Implement the real WA client behind lib/wa/send.ts's existing signature using Fonnte's API. Use the locked OTP template from copy-id.md §9 verbatim for authentication sends; general template for nudges/notifications. Failures log and return, never throw into calling flows. Show me the plan before writing any code.

---

## Phase B1 — OTP verification flow

Per privacy policy §4 (already locked): codes expire in 5 minutes, stored only as hashes while valid, deleted after.

Scope:
- `otp_codes` table (or equivalent): phone_hash, code_hash, expires_at, consumed_at. Migration via CLI as always.
- Request endpoint: rate-limited hard (this is the most abusable surface built so far — OTP request spam costs real money per message AND can harass arbitrary phone numbers). Per-phone AND per-IP limits. Same TOCTOU caveat as the existing rate limiter applies; note it, don't over-engineer it yet.
- Verify endpoint: constant-time compare, single-use (consumed_at set atomically), expired codes rejected.
- The OTP message template is already locked (§9) — no new copy needed for the message itself. New screen copy (enter-phone, enter-code, resend, error states) IS new locked copy → drafted, user-approved, into copy-id.md before implementation.

**Security review checklist for the auditor session:** enumeration (does the request endpoint reveal whether a phone exists in SAKSI?), replay, brute-force window (6-digit code × 5 minutes → needs attempt-count lockout), SMS-pumping abuse (rate limits are the defense).

> **Claude Code prompt:**
> Plan the OTP flow: table + migration, request endpoint (per-phone and per-IP rate limits), verify endpoint (hashed compare, atomic single-use, 5-minute expiry per the locked privacy policy §4). Flag every new user-facing string for copy approval before writing it. Plan only, stop before code.

---

## Phase B2 — Laporan filing (the reporter's side)

Per T&C §4 (locked): reporter must OTP-verify before the laporan processes; every report has a traceable owner.

Scope:
- Eligibility: deal in DIBAYAR_DIKLAIM (or DISEPAKATI per the TENGGAT_LEWAT rules), deadline passed, filer is a party to the deal.
- Flow: open laporan screen → OTP-verify the filer's phone → create `flags` row (hak_jawab_status = MENUNGGU, 14-day clock starts) → hash-chained deal_event.
- The sweep's TENGGAT_LEWAT firing rule (already locked): fires when a laporan exists, any day post-deadline. Filing a laporan is exactly the trigger — confirm the sweep and this flow agree on that handshake rather than both trying to own the transition.
- Notification to terlapor via WA (UTILITY template): "you've been reported, you have 14 days" — new locked copy, neutral register, states facts and the window, no accusation language.
- New screen copy throughout → approval pass first.

**Design note carried from earlier decisions:** the reporter's traceability is the anti-abuse mechanism. Serial unfounded reporters become visible in the pattern the same way serial breachers do. Nothing in this phase adds a "report quality" judgment — SAKSI records who reported whom, and repetition speaks for itself.

---

## Phase B3 — Hak jawab (the reported party's side)

Per T&C §5 (locked, updated to "klaim berbeda" wording this session).

Scope:
- Terlapor opens their deal link → sees the laporan exists, the 14-day deadline, and their options: respond, or don't.
- Response = text + **optional evidence attachment** (the decision locked earlier: e.g. a bank statement covering the claimed date range). This option exists ONLY as a response to being reported — never proactively. Upload shares the bukti storage/RLS infrastructure from Tier A.
- Response → hak_jawab_status = DISPUTED internally, user-facing status "klaim berbeda" everywhere. Both sides' evidence sits on the record permanently.
- **The no-clean-exit rule (locked):** a dispute + counter-proof can never resolve the deal into a clean or positive record for either party. The only positive outcome remains the original confirmation flow. Verify no code path in this phase can flip a disputed deal to anything clean.
- Silence through 14 days → the flag publishes (Phase B4). Mid-dispute silence for another 14 days → the "tidak merespons dalam 14 hari" line appends (already locked copy).
- The soft nudge in the evidence-request copy (locked decision): ask for a statement covering the full claimed date range — makes selective cropping more visible without pretending SAKSI can verify anything.

---

## Phase B4 — Publication (the flag goes live)

The highest-stakes code in the product. Everything here is behind the GATE 1 feature flag until lawyer review clears.

Scope:
- The 14-day expiry check belongs in the existing daily sweep (one scheduler, new outcome branch: hak_jawab window lapsed → publish), not a second cron.
- Flag rendering: rung line (0/1/2 per the record's actual proof state — never hardcoded) + tier body template (§1, verbatim) + DISPUTED suffix when applicable + evidence sub-line when applicable.
- Identifier scope: masked rekening + bank. Phone hash and identity-verified markers are reserved for future seller-account-tier gating (not yet designed). Never a full phone number, never a NIK, never a bukti image.
- Late fulfillment after publication (T&C §5.4, locked): status can update on both parties' confirmation, but the history stays — "pemenuhan yang terlambat tercatat sebagai pemenuhan yang terlambat, bukan sebagai penghapusan."
- Hash-chain every publication event. A published flag that SAKSI could silently unpublish would break the product's core promise in the exact place it matters most.

---

## Phase B5 — Public check pages

The surface the entire corpus exists to feed. Also the surface GATE 2 constrains hardest.

Scope:
- Lookup by rekening (bank + number) or by phone number (hashed server-side before matching — the raw number never touches a query log).
- Result rendering per the locked forced-check copy: history line with outcome counts (selesai, dibatalkan bersama, tidak dilanjutkan, dikembalikan, tidak dipenuhi, klaim berbeda aktif), account age, verification level.
- **Empty state verbatim, never softened** (§2): "Belum ada riwayat di SAKSI — ini bukan jaminan aman. Sebagian besar rekening belum tercatat." The empty state is where trust-washing pressure will be strongest; the copy is locked precisely so it can't drift.
- Trust-washing guards (§8) enforced in code review, not just copy: no scores, no stars, no green checks, no safety colors on any profile surface. "Terverifikasi" only ever modifies a fact, never a person.
- Anti-enumeration: rate-limit lookups; don't build an API that lets someone bulk-harvest which numbers exist in SAKSI.
- **Until both gates clear:** pages ship behind noindex + no inbound links from anywhere on the site. Built and testable via direct URL, invisible otherwise. This is what keeps the build compliant with Option A while still making progress.
- This phase finally re-justifies the homepage check-search-bar that was removed in Tier A — it comes back only when this phase is live AND the gates have cleared.

---

## Phase B6 — Wire the nudge + finish the sweep's untested branches

The sweep shipped in Tier A with the WA send stubbed. Now that B0 exists:
- Un-stub the nudge send path; verify NUDGE_SENT dedup works against real sends.
- The TENGGAT_LEWAT branch now has a real trigger source (B2's laporan filing) — integration-test the handshake.
- Verify KEDALUWARSA still fires correctly for deals where no laporan ever appears (the branch most likely to have been silently broken by B2's changes).

---

## Copy inventory needed for Tier B (all drafted → user-approved → copy-id.md before code uses them)

- OTP screens: enter phone, enter code, resend, expired, too-many-attempts
- Laporan flow: eligibility explanation, confirmation screen, post-filing state
- Terlapor WA notification (UTILITY template — the highest-sensitivity new string in the tier; neutral register, facts + window only)
- Hak jawab screens: laporan summary as shown to terlapor, response form, evidence-attachment request (full-date-range wording), post-response state
- Check page: lookup form, results frame, rate-limit message
- Already locked, needs no new drafting: flag ladder lines, tier body templates, DISPUTED suffix + evidence sub-line, empty state, §9 OTP message

---

## Standing rules, restated for the tier where they matter most

- Every published sentence must be true even if the reporter lied. The rung system exists so that a fabricated bukti still yields a true Rung-0 sentence ("diklaim pelapor — belum dikonfirmasi").
- Neutral register everywhere: no "penipu," no "membantah," no "sengketa" user-facing, no moral verdicts. Outcomes, dates, and who-responded — nothing else.
- Auditor session reviews every phase here (this is the tier the security-auditor setup was built for): OTP abuse surface, publication logic, PII leakage on public pages, enumeration.
- monster_check before every commit; manual review for everything (nothing in this tier qualifies as auto-mode-safe except pure reads).
- Deferred items land in ROADMAP.md with a target, or they don't get deferred.

## Order note

B0 → B1 → B2 → B3 → B4 → B5, with B6 threaded in after B2. The gates run in parallel from day one: **start the PSE filing and the lawyer conversation NOW, not when the code is done** — both have lead times measured in weeks, and the code will otherwise finish first and sit blocked behind them.

## Pre-flight checklist from Tier A (verify before calling A done)

- [ ] Backup + keepalive GitHub Action verified actually running (not just YAML written) — more critical now, since Tier B records are the ones people will fight over
- [ ] Deadline sweep coded and deployed (not just planned), KEDALUWARSA firing verified
- [ ] Bukti upload + Gemini OCR working end-to-end with the three locked verdict labels
- [ ] SELESAI reachable through the full happy path with per-deal-type confirmation labels
- [ ] Accept screen live and DISEPAKATI firing through the real RPCs
- [ ] Everything committed AND pushed (remember the silent-push-failure incident)
