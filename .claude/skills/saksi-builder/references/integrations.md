# SAKSI Integrations

## 1. Midtrans (tier fees only — transaction money NEVER touches SAKSI)

- Product: Snap (hosted payment page). Sandbox: dashboard.sandbox.midtrans.com, free.
- **LIMA_RIBU tier: enable QRIS only.** Disable VA/e-wallet/cards on this tier's Snap request (`enabled_payments: ["qris"]`). QRIS MDR ~0.7% (≈Rp35 on Rp5.000). VA is ~Rp4.000 flat — forbidden here.
- BERMETERAI tier: QRIS preferred; VA acceptable (Rp4.000 on Rp50.000 = 8%).
- Verify the acquirer's QRIS minimum amount in sandbox before demo (some floors ~Rp1.500; Rp5.000 clears, but confirm).
- Webhook: Supabase Edge Function; verify signature; idempotent by `order_id`; on `settlement` → emit fee-paid event and advance flow. Fee is charged at DISEPAKATI and is non-refundable (state in T&C).

## 2. WhatsApp OTP — REMOVED from the breach-filing path 2026-07-21 (copy-id.md §25)

**Do not build against this section for breach filing.** It described the
`lib/otp.ts` module and its one call site — gating `fileBarangTidakSesuaiReport`/
`fileDeadlineLapseReport` on a verified WA code. That module is deleted. The
OTP step meant a Fonnte outage blocked the wronged party's only recourse —
the worst failure mode this pipeline can have — so identity on those paths is
now `identifyPartyByPhone` only (party-of-this-deal, re-derived server-side),
which does not prove phone possession. See §25 for the full reasoning before
touching this again.

The content below is kept for reference only, in case phone-possession proof
is ever rebuilt for a *different* call site (LIMA_RIBU/BERMETERAI tier
verification, data-model.md's Tier spec — a separate, not-yet-built feature
that never shared `lib/otp.ts`'s implementation in the first place per its own
"not yet a generic multi-purpose OTP module" note):

- Meta Cloud API direct (no BSP subscription; per-message billing, authentication category ~Rp367–430 for Indonesian numbers) — needs a Meta Business + a dedicated phone number. If setup friction threatens the deadline, use Fonnte/Maxchat (Indonesian BSPs, fast onboarding, ~Rp430+/message).
- Template category: AUTHENTICATION, with the copy in copy-id.md §9 (formatOtpMessage — also retired §25; write new copy for whatever mechanism is actually chosen).
- Rate limits (enforce server-side): 3 sends/phone/hour, 5 verify attempts/code. Codes: 6 digits, 5-minute expiry, single-use, stored hashed.

## 3. Didit e-KYC (BERMETERAI tier)

- Sandbox starts on signup at business.didit.me; deterministic synthetic test IDs — demo the full flow with zero real KTPs.
- Production: full KYC bundle (ID verification + passive liveness + face match + IP analysis) $0.33/successful check, first 500/month free, pay-per-success.
- Flow: create session server-side → redirect user to Didit hosted flow → webhook (HMAC-signed — verify it) → store `ekyc_status`, `ekyc_ref` on `parties`. Store the Didit reference, NOT the document images or NIK.
- **Claim discipline:** Didit proves document-appears-genuine + face-matches. It is NOT a Dukcapil database check. UI says `Identitas terverifikasi (e-KYC)` — never `terverifikasi Dukcapil`. Dukcapil-connected vendor (Verihubs/VIDA/Privy) is a roadmap swap when a paying use case demands it.
- Both parties must each complete their own e-KYC; one party may pay the fee for both, but verification itself cannot be delegated.

## 4. Hash + OpenTimestamps (the witness core — build first)

- Canonical JSON: stable key order, no whitespace, amounts as integers, dates ISO-8601. Hash = SHA-256 hex.
- On every `deal_events` insert: compute `new_hash` over the post-event canonical deal (including full event history hashes — chain them: include `prior_hash` in the hashed payload).
- Anchor async (queue/cron): `opentimestamps` npm client, submit hash, store pending `.ots`; upgrade proofs on a daily cron (Bitcoin confirmation lag is hours — display `dijangkar, menunggu konfirmasi` until upgraded). Free, no keys, no accounts.
- Never block a user flow on anchoring; the hash in Postgres is the operational integrity check, OTS is the external witness.

## 5. Evidence-pack PDF (BERMETERAI deliverable; also the demo's corpus-payoff moment)

Generate with pdf-lib, one PDF per deal, following the field set of the IASC-accepted report format (reverse-engineered by victim P052; presupposes items the user must add themselves — mark those as fill-in fields):

1. Identitas pelapor: nama lengkap, No. KTP, nomor rekening pelapor — from e-KYC where available, else fill-in.
2. Identitas terlapor: nama, nomor rekening, bank tujuan — from the record.
3. Kronologi: auto-generated from `deal_events` (timestamped, hash-referenced).
4. Waktu transfer persis + nominal — from bukti OCR fields.
5. Lampiran: bukti transfer image(s), the agreement record (with meterai page if applied), hash + OTS reference.
6. Fill-in placeholders the system cannot supply: `[Nomor Laporan Polisi (LP)]`, `[bukti lapor ke bank pengirim]`, `[bukti lapor ke bank penerima]` — include a checklist page telling the user these are required by IASC and must be obtained by them. Never imply SAKSI filed these.
7. Footer on every page: `Dokumen ini adalah rekaman kesepakatan dan klaim para pihak yang dicatat SAKSI. SAKSI bukan lembaga penegak hukum.`

## 6. OCR consistency check (free tier onward)

- Implementation: Gemini API multimodal call (or Tesseract fallback) extracting {nominal, tanggal, rekening_tujuan, bank} from the uploaded bukti; compare against the deal record; write `ocr_result` + verdict. Constrain the output schema to the closed verdict vocabulary — the model must not be able to emit "asli"/"terverifikasi" language on its own.
- Verdict vocabulary is closed: KONSISTEN | TIDAK_KONSISTEN | TIDAK_TERBACA, with the exact labels in copy-id.md §5. The word "asli" must not appear in any OCR-adjacent string, log, or variable name that surfaces to users.
- TIDAK_KONSISTEN does not block upload (the mismatch itself is evidence); it warns the uploader and is recorded.

## 7. Explicitly deferred (do not build now)

- Open-banking mutasi verification (Brick/Ayoconnect) — unlocks flag rung 2.
- Real e-Meterai distributor integration (Peruri channel via OnlinePajak/Privy business account).
- Dukcapil-backed e-KYC swap.
- PSE Kominfo registration (pre-public-launch task, administrative).
- B2B risk-check API (gated on corpus density milestone, ~50–100rb identifiers).
