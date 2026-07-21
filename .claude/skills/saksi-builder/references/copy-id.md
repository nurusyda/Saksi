# SAKSI — Locked Indonesian Copy

Use these strings VERBATIM. They are legal load-bearing surfaces; paraphrasing them changes their truth-conditions. `[...]` = interpolated values.

## 1. Flag ladder (state-dependent — select by record state, never hardcode one)

**Rung 0 — payment claimed only:**
> Bukti transfer diklaim pelapor. Belum dikonfirmasi pihak terlapor, belum diverifikasi bank.

**Rung 1 — counterpart confirmed receipt in-flow:**
> Pembayaran dikonfirmasi kedua pihak. Belum diverifikasi bank.

**Rung 2 — open-banking verified (roadmap; do not ship enabled):**
> Pembayaran terverifikasi melalui mutasi bank.

**Flag body templates by tier** (prepend the correct rung line):
- GRATIS: `1 kesepakatan tercatat tidak dipenuhi ([tgl]). Identitas para pihak tidak diverifikasi. Terlapor tidak merespons dalam 14 hari.`
- LIMA_RIBU: `1 kesepakatan tercatat tidak dipenuhi ([tgl]). Nomor HP kedua pihak terverifikasi. Terlapor tidak merespons dalam 14 hari.`
- BERMETERAI: `1 kesepakatan bermeterai tidak dipenuhi ([tgl]). Identitas terverifikasi (e-KYC). Dokumen siap diajukan sebagai bukti. Terlapor tidak merespons dalam 14 hari.`
- DISPUTED suffix (replaces the last sentence when hak jawab filed): `Terlapor memberikan tanggapan. Status: klaim berbeda.`
  - If terlapor attached evidence, append: `Terlapor menyertakan bukti pada tanggapannya.`

**Flag identifier lines** (shown below the flag body, per-tier gated — matches data-model.md's Breach pipeline tier gate: GRATIS shows rekening only, LIMA_RIBU adds phone_hash, BERMETERAI adds identity_verified):
- Rekening (all tiers): `Rekening: [bank] [rekening_masked]`
- Phone verified (LIMA_RIBU+): `Nomor HP terverifikasi · ID: [12-char hash fragment]`
- Identity verified (BERMETERAI only): `Identitas terverifikasi (e-KYC)`

**Note:** `SENGKETA` remains the internal status value only (`DealStatus.SENGKETA`, `flags.hak_jawab_status`); the word "sengketa" must never appear on any user-facing surface.

## 2. Forced-check page (payer, before copy-rekening activates)

**With history:**
> Rekening tujuan: [bank] [rekening_masked] · [N] kesepakatan selesai · [N] tidak dipenuhi · tercatat sejak [bulan tahun]

**Empty state (MUST show, never soften):**
> Belum ada riwayat di SAKSI. Ini bukan jaminan aman. Sebagian besar rekening belum tercatat.

**Copy button label (disabled → enabled):** `Lihat riwayat dulu` → `Salin nomor rekening`

## 3. Attestations (4 individual checkboxes at record creation, both parties; not bundleable)

1. `Saya berusia 18 tahun ke atas.`
2. `Nomor HP dan rekening yang saya masukkan milik saya sendiri.`
3. `Saya setuju data saya diproses untuk pencatatan dan pencocokan riwayat kesepakatan.`
4. `Saya paham SAKSI hanya mencatat, tidak menahan dana atau menjamin pihak lain.`

**Bundled T&C line (single checkbox):** `Saya menyetujui Syarat & Ketentuan SAKSI: publikasi kesepakatan tidak terpenuhi, hak menjawab dalam 14 hari jika dilaporkan, dan larangan bukti palsu.`

**At bukti upload (blocking checkbox):**
> Bukti yang saya unggah asli dan belum diubah. Mengunggah bukti palsu adalah tanggung jawab hukum saya.

## 4. N8 refund warning (refund screen, always visible, not dismissible)

> Pengembalian dana tidak pernah memerlukan transfer tambahan dari Anda. Jika Anda diminta membayar lagi agar dana "cair", itu ciri penipuan.

## 5. OCR verdict labels (never say "asli" / "terverifikasi")

- `KONSISTEN`: `Bukti konsisten dengan kesepakatan (nominal, tanggal, rekening tujuan cocok). Pemeriksaan konsistensi, bukan verifikasi bank.`
- `TIDAK_KONSISTEN`: `Bukti tidak konsisten dengan kesepakatan: [field yang berbeda]. Periksa kembali sebelum melanjutkan.`
- `TIDAK_TERBACA`: `Bukti tidak dapat dibaca otomatis. Dicatat sebagai klaim tanpa pemeriksaan konsistensi.`

## 6. Tier cards

- GRATIS — `Catat kesepakatan. Rekening tujuan terekam dari bukti transfer.`
- LIMA_RIBU — `Rp5.000/pihak · Nomor HP kedua pihak terverifikasi (OTP WhatsApp).`
- BERMETERAI — `Rp50.000/pihak · Identitas terverifikasi (e-KYC) + meterai elektronik + berkas bukti siap diajukan.`
- Shared footer: `Tingkatan menunjukkan kekuatan verifikasi identitas kedua pihak, bukan keamanan kesepakatan. Mengajukan dan melihat laporan selalu gratis di semua tingkatan.`
- Notify-me checkbox label (paid-tier disabled cards, shipped Phase 0.6): `Beri tahu saat tersedia.`

## 6a. Deal-type gating (create flow) — REMOVED 2026-07-20

The jenis-transaksi (deal-type) selector — a static "Jual-beli" card plus two
disabled "Segera hadir" cards for Pinjam-meminjam/Sewa-menyewa — was removed
from the create form entirely (UX audit, 2026-07-20). It offered no real
choice (only Jual-beli was ever functional) and added a full section of
visual clutter ahead of the fields that matter. Backend/schema/state machine
are unaffected — deal type is still fully implied by `proposer_role`, which
the server still validates. If Pinjam-meminjam/Sewa-menyewa ship later, this
section should be redesigned rather than restored as-is; the `Belum tersedia`
label and interest-capture checkboxes it used are gone with it.

## 7. Extension & exit-state record lines (public record wording)

- PERPANJANGAN: `Batas waktu diperpanjang ke [tgl], disepakati kedua pihak.`
- DIBATALKAN_BERSAMA: `Dibatalkan atas kesepakatan bersama ([tgl]).`
- TIDAK_DILANJUTKAN: `Disepakati [tgl]; tidak dilanjutkan. Belum ada transfer tercatat.`
- KEDALUWARSA: `Disepakati [tgl]; pembayaran diklaim [tgl], tidak ada tindak lanjut dari kedua pihak selama 30 hari. Catatan kedaluwarsa.`
- DIKEMBALIKAN_PENUH: `Dibatalkan; dana dikembalikan penuh, dikonfirmasi kedua pihak ([tgl]).`
- DIKEMBALIKAN_SEBAGIAN: `Dibatalkan; sebagian dana dikembalikan, dikonfirmasi kedua pihak ([tgl]).`
- SENGKETA silence: `Terlapor tidak merespons dalam 14 hari.`

## 8. Trust-washing guards

- New profile banner: `Akun baru. Belum ada riwayat di SAKSI.`
- FORBIDDEN WORDS anywhere in UI applied to a party, profile, or record: `aman`, `terpercaya`, `terverifikasi aman`, `bebas penipuan`, any score, stars, or safety colors (green check on a profile). "Terverifikasi" may only modify a *fact* (nomor HP terverifikasi, identitas terverifikasi), never a *person's character*.
- Canonical-domain line in badge/share card: `Cek keaslian catatan hanya di saksi.app, bukan .com, bukan .id, bukan yang lain.`

## 9. OTP message (WA authentication template)

*Sender identity: the WhatsApp Business display name is `SAKSI (saksi.app)` — the domain in the sender name is part of the anti-phishing story; keep it consistent everywhere.*

> Kode verifikasi SAKSI Anda: [kode]. Berlaku 5 menit. Jangan bagikan kepada siapa pun, termasuk pihak yang mengaku dari SAKSI.

## 9a. Deadline nudge (WA notification)

*Sender identity: same as §9 — `SAKSI (saksi.app)`.*

> Kesepakatan SAKSI Anda ("[deskripsi]") telah melewati batas waktu. Buka [url] untuk melihat status dan tindakan yang diperlukan.

*Message is state-agnostic by design: does not name the specific action (differs by DIBAYAR_DIKLAIM vs DIKONFIRMASI_TERIMA) and does not preview day-counts for what happens next, so the text can't drift out of sync with the sweep's grace-period numbers.*

## 9b. Turn-taking WA notifications (locked 2026-07-20)

*Sender identity: same as §9/§9a — `SAKSI (saksi.app)`. Unlike §9a's deadline nudge, each of these is tied to exactly one transition, so each names the specific next action rather than staying state-agnostic.*

Fired once per transition, to whichever party must act next:

- **Counterpart joined (DRAF → DIAJUKAN), to the proposer:**
  > Kesepakatan SAKSI Anda ("[deskripsi]") sudah dibuka pihak lain. Buka [url] untuk menyetujui.
- **One party accepted, to the party who hasn't yet:**
  > Pihak lain telah menyetujui kesepakatan SAKSI Anda ("[deskripsi]"). Buka [url] untuk menyetujui.
- **Both accepted (→ DISEPAKATI), to the payer:**
  > Kesepakatan SAKSI Anda ("[deskripsi]") telah disetujui kedua pihak. Buka [url] untuk melakukan pembayaran.
- **Bukti uploaded (→ DIBAYAR_DIKLAIM), to the payee:**
  > Bukti transfer telah diunggah untuk kesepakatan SAKSI Anda ("[deskripsi]"). Buka [url] untuk mengonfirmasi penerimaan dana.
- **Receipt confirmed (→ DIKONFIRMASI_TERIMA), to the payer:**
  > Penerimaan dana telah dikonfirmasi untuk kesepakatan SAKSI Anda ("[deskripsi]"). Buka [url] untuk mengonfirmasi barang diterima.

## 9c. Breach-path WA notifications (locked 2026-07-20)

*Sender identity: same as §9/§9a/§9b — `SAKSI (saksi.app)`. Shipped and in production use (see `lib/copy.ts`'s `formatBreachReportFiledMessage`/`formatHakJawabFiledMessage`). Reviewed 2026-07-20: internal state names replaced with the "klaim berbeda" user-facing wording (§8's rule — never surface "sengketa"/dispute language, even in reference docs).*

- **Report filed (→ TIDAK_DIPENUHI), to the flagged party — the highest-sensitivity string in this set: states the fact and the window, no accusation language, no verdict:**
  > Laporan diajukan untuk kesepakatan SAKSI Anda ("[deskripsi]"). Anda memiliki 14 hari untuk menanggapi. Buka [url] untuk melihat detail.
- **Hak jawab filed (status becomes "klaim berbeda"), to the original reporter:**
  > Pihak penjual telah menanggapi laporan pada kesepakatan SAKSI Anda ("[deskripsi]"). Buka [url] untuk melihat tanggapannya.

## 10. Meterai mock label (demo only)

> Simulasi meterai elektronik. Integrasi distributor resmi Peruri pada rilis produksi. Dokumen ini belum bermeterai.

## 11. Landing tagline (landing page subheading + meta description — must be identical)

> Percaya itu baik. Tercatat lebih baik.

## 12. Deal state UI (join flow)

**Join form heading (visible to all viewers with the link in DRAF state):**
> Masukkan nomor HP Anda untuk bergabung sebagai pihak penerima.

**Join form instruction (visible to all viewers with the link in DRAF state):**
> Nomor HP yang Anda masukkan akan tercatat sebagai pihak dalam kesepakatan ini. Centang semua pernyataan di bawah untuk melanjutkan.

**Phone field label (used verbatim in both join & accept forms):** `Nomor HP Anda`

**Phone format hint (used verbatim in both join & accept forms):** `Format: 08xx atau +628xx`

**DIAJUKAN status line (defensive fallback only as of 2026-07-20 — see below; kept for any pre-migration row still sitting in this status):**
> Kedua pihak tercatat. Menunggu persetujuan kedua pihak.

**Self-join error (counterpart phone matches proposer phone):**
> Nomor HP ini sudah digunakan untuk membuat kesepakatan ini. Masukkan nomor HP pihak lain.

**Deal-save failure (atomic RPC failed; shown on create and on join):**
> Gagal mencatat kesepakatan. Coba lagi.

**Join technical failure (RPC failed for a non-race reason — network/DB error; distinct from "already closed" race):**
> Gagal bergabung. Coba lagi.

**Wrong-phone error (phone matches neither the proposer nor the counterpart — shared by every post-join identity check, not accept-specific):**
> Nomor ini tidak terdaftar pada kesepakatan ini.

**Retired 2026-07-20 (migration 0025 — see data-model.md's "Accept step folded into join"):** the separate DIAJUKAN accept screen and its four strings (accept button `Setuju`, already-accepted status line, accept technical-failure message, and the accept-step framing of the too-many-attempts message) no longer apply — `joinDeal` fires `ACCEPTED` automatically, atomically, with no separate phone re-entry or button. Not reused for anything else; noted here rather than silently dropped, same treatment every other retirement in this file gets. `ERROR_TOO_MANY_ATTEMPTS` itself (`Terlalu banyak percobaan. Coba lagi nanti.`) is still live — it was already shared by every `identifyPartyByPhone` call site before this change, not accept-exclusive.

**DISEPAKATI placeholder — superseded before this change too:** the real DISEPAKATI screen (`DisepakatiPanel.tsx`) already replaced this placeholder in an earlier slice; left here only as a historical note, not live copy.

## 13. Role labels and pairings

**Proposer role labels** (displayed in deal summary card and form; values are stored in `deals.proposer_role`):

| Value | Display |
|---|---|
| `PENJUAL` | Penjual |
| `PEMBELI` | Pembeli |
| `PEMBERI_PINJAMAN` | Pemberi Pinjaman |
| `PEMINJAM` | Peminjam |
| `PEMILIK` | Pemilik |
| `PENYEWA` | Penyewa |
| `LAINNYA` | Lainnya |

**Complementary-role map** (`ROLE_PAIR` — for counterpart display in deal summary and live preview):
- PENJUAL ↔ PEMBELI
- PEMBERI_PINJAMAN ↔ PEMINJAM
- PEMILIK ↔ PENYEWA
- LAINNYA → null (no defined counterpart — show "Pihak lain" without a specific role label)

**Counterpart role helper line (buat form — shown under role selector when a role with a defined pair is selected; omit entirely when ROLE_PAIR returns null):**
> Pihak lain akan tercatat sebagai: [peran pihak penerima]

**Counterpart role fallback label (used when ROLE_PAIR returns null, i.e. LAINNYA; also used in deal summary card when counterpart role is indeterminate):**
> Pihak lain

**Tier short labels** (displayed in deal summary card; full descriptions in §6):

| Value | Display |
|---|---|
| `GRATIS` | Gratis |
| `LIMA_RIBU` | Rp5.000/pihak |
| `BERMETERAI` | Rp50.000/pihak |

## 14. Per-deal-type confirmation labels (keyed on role pair; shown on the fulfillment-confirmation action)

| Deal type | Role pair | Confirmation label |
|---|---|---|
| Jual-beli | PENJUAL / PEMBELI | `Konfirmasi barang diterima` |
| Pinjam-meminjam | PEMBERI_PINJAMAN / PEMINJAM | `Konfirmasi uang sudah dikembalikan` |
| Sewa-menyewa | PEMILIK / PENYEWA | `Konfirmasi sudah menempati` |

## 15. Item title + detail (buat form) — supersedes the single free-text description, locked 2026-07-20

The single `Deskripsi kesepakatan` textarea (and its role-keyed placeholder
table) is replaced by two fields, for the only role pair the create form
actually reaches (Jual-beli — PENJUAL/PEMBELI; deal-type gating unchanged,
see §6a). Composed server-side into the same `item_desc` column as before
(period join, never an em dash): title alone if detail is blank, otherwise
`"${title}. ${detail}"`.

- Title field label: `Barang/jasa apa?`
- Title placeholder (required, max 80 chars): `Contoh: iPhone 13 128GB hitam`
- Detail field label: `Detail tambahan (opsional)`
- Detail placeholder (optional, max 400 chars): `Contoh: Kondisi baru, termasuk box dan charger, dikirim setelah lunas.`

Rationale: a category dropdown was considered and rejected — it would
discard exactly the specificity the breach flow depends on (§16's
`BARANG_TIDAK_SESUAI_PROMPT` asks which part of *this description* wasn't
met; "Elektronik x1" gives a claimant nothing to point at). A single-textarea
fill-in-the-blank template (`Jual ..., banyaknya ...`) was also tried and
rejected — same box, same 500-char requirement, only the ghost text changed,
so the "blank paragraph" problem was unchanged. The title/detail split is a
structural fix: the title is a one-line input (reads as "name the thing," not
"write a description") and the detail box is genuinely optional and
skippable, matching the pattern established marketplace apps (Facebook
Marketplace, Carousell, OLX) already use for exactly this problem.

## 16. Section C — payment lifecycle (DISEPAKATI → SELESAI, jual-beli; locked 2026-07-20)

Started as DRAFT in the Section C build; reviewed against this file's own forbidden-words/fact-not-person rule (§8) and data-model.md's breach pipeline before locking. One string was corrected during that review (see the consequences list below).

**Deal-type selector, "coming soon" badge (§6a's disabled jenis-transaksi cards):**
> Segera hadir

**C4 — Penjual's DIBAYAR_DIKLAIM page:**
- Confirm-receipt button: `Konfirmasi uang diterima`
- "Funds not received" button (Option A — no state change, no notification): `Dana belum masuk`
- OCR authenticity disclaimer: `Pemeriksaan konsistensi bukan pemeriksaan keaslian. Buka aplikasi perbankan Anda sendiri sebelum mengonfirmasi.`

**C5 — DIKONFIRMASI_TERIMA, both sides:**
- Penjual's ship instruction: `Uang telah dikonfirmasi diterima. Kirim barang sesuai kesepakatan.`
- "Barang tidak sesuai" entry button: `Barang tidak sesuai kesepakatan`

**C6 — "Barang tidak sesuai" report filing (live, OTP-gated — see §17 for the OTP step and modal chrome; shipped build step 4, 2026-07-20):**
- Prompt: `Bagian mana dari keterangan di atas yang tidak dipenuhi?`
- Consequences list:
  1. `Laporan tercatat sebagai klaim Anda, bukan putusan SAKSI.`
  2. `Penjual mendapat 14 hari untuk menanggapi.`
  3. `Laporan Anda dan tanggapan pihak lain (jika ada) sama-sama tercatat permanen di catatan rekening ini.`
  4. `SAKSI tidak menengahi dan tidak mengembalikan dana.`
  5. `Nomor HP pelapor terverifikasi. Laporan palsu juga tercatat permanen atas nomor ini.` — **corrected during locking review**: the original draft said "Identitas pelapor terverifikasi... atas nama Anda," which overclaimed identity verification when only phone/OTP verification is actually performed at report-filing time (breach filing is free and phone-OTP-gated at every tier, including GRATIS, which verifies nothing else about the person — §8's rule that "terverifikasi" may only modify a fact, never a person's character, applies here).
- Submit button label: `Kirim Laporan`
- **Retired**: the gate banner (`Fitur pelaporan memerlukan verifikasi nomor HP (OTP), belum tersedia...`) described the pre-OTP stub state and no longer applies now that filing is live. Not reused for a future stub — write a new banner if one is needed later.

**C7 — SELESAI (minimal, both sides identical, no action buttons; pending a real design pass):**
> Kesepakatan selesai. Tercatat di SAKSI.

**Deal-event timeline labels (C5/C7's "Riwayat" card; an unmapped event falls back to the raw event name):**

| Event | Label |
|---|---|
| `CREATED` | `Kesepakatan dibuat` |
| `COUNTERPART_JOINED` | `Pihak lain bergabung` |
| `PROPOSER_ACCEPTED` | `Pengaju menyetujui` |
| `COUNTERPART_ACCEPTED` | `Pihak lain menyetujui` |
| `ACCEPTED` | `Kesepakatan disetujui kedua pihak` |
| `BUKTI_UPLOADED` | `Bukti transfer diunggah` |
| `RECEIPT_CONFIRMED` | `Penerimaan dana dikonfirmasi` |
| `FULFILLMENT_CONFIRMED` | `Barang/pemenuhan dikonfirmasi` |
| `TENGGAT_LEWAT` | `Laporan diajukan: kesepakatan tidak dipenuhi` |
| `HAK_JAWAB_FILED` | `Tanggapan pihak terlapor diajukan` |

## 17. Breach-path screens (locked 2026-07-20)

Backfilled per the Tier B copy-lock discipline: these strings were drafted directly in `lib/copy.ts` and shipped ahead of being added here; content unchanged from what's live in production. Reviewed 2026-07-20 against §8 (trust-washing/forbidden-words) and the fact-not-person rule — confirmed the deadline-lapse entry point (below) can only ever fire from `DIBAYAR_DIKLAIM`, i.e. after the buyer has already claimed payment, so "Kesepakatan tidak dipenuhi setelah batas waktu" never mislabels an unpaid, never-shipped deal as a breach — that case resolves to `TIDAK_DILANJUTKAN`/`KEDALUWARSA` instead, per ROADMAP.md, and is not reachable through this button at all. `SENGKETA` state name replaced with "klaim berbeda" wording throughout, same as §9c.

**Modal chrome (shared by both report-filing modals):**
- "Barang tidak sesuai" modal heading: `Barang Tidak Sesuai Kesepakatan`
- Deadline-lapse modal heading: `Laporkan Kesepakatan Tidak Dipenuhi`
- Close button (both modals): `Tutup`

**OTP step (inside both report-filing modals, after the note/prompt, before submit):**
- Step heading: `Verifikasi nomor HP Anda untuk melanjutkan laporan.`
- Send-code button: `Kirim kode verifikasi`
- Resend-code button: `Kirim ulang kode`
- Code field label: `Kode verifikasi`
- Code format hint: `6 digit, berlaku 5 menit`
- Verify button: `Verifikasi`
- Error, send failed: `Gagal mengirim kode. Coba lagi.`
- Error, send rate-limited: `Terlalu banyak permintaan kode. Coba lagi dalam satu jam.`
- Error, code invalid/expired: `Kode salah atau sudah kedaluwarsa.`
- Error, too many verify attempts: `Terlalu banyak percobaan. Minta kode baru.`
- Error, filing itself failed after verification: `Gagal mencatat laporan. Coba lagi.`

**Deadline-lapse entry point (the "ghost seller" second report path — DIBAYAR_DIKLAIM, deadline passed, Penjual never confirmed receipt; mirrors C6 exactly except the claim is system-derivable, so the note is optional):**
- Entry button: `Kesepakatan tidak dipenuhi setelah batas waktu`
- Note prompt (optional, unlike C6's required field note): `Catatan tambahan tentang kesepakatan ini (opsional):`
- Error, deadline not yet passed: `Batas waktu kesepakatan ini belum terlewati.`

**TIDAK_DIPENUHI / klaim berbeda screens (state-agnostic — renders the same regardless of which of the two report paths above produced it):**
- Reporter's waiting state: `Laporan Anda tercatat. Menunggu tanggapan pihak penjual (14 hari sejak laporan diajukan).`
- Flagged party's heading: `Laporan diterima: kesepakatan dianggap tidak dipenuhi.`
- Reporter's field-note label: `Catatan pelapor:`
- Status line once hak jawab is filed: `Status: klaim berbeda.`

**Hak jawab response form (flagged party, within the 14-day window):**
- Response note label (optional): `Catatan tanggapan Anda (opsional)`
- Evidence attachment label (optional — offered only as a response to being reported, never proactively): `Lampirkan bukti pendukung (opsional)`
- Evidence attachment hint: `Jika mengunggah mutasi rekening, sertakan seluruh rentang tanggal yang diklaim, bukan potongan sebagian.`
- Evidence view link (shown to both parties once attached): `Lihat bukti pendukung`
- Submit button: `Kirim Tanggapan`
- Error, window closed: `Jendela 14 hari untuk menanggapi telah berakhir.`
- Error, response failed: `Gagal mencatat tanggapan. Coba lagi.`

## 18. Public check page (`/cek`) — locked 2026-07-20

Live in production, backfilled here for the record. **GATE 2 reminder:** this page stays `noindex` and unlinked from anywhere else in the app regardless of copy status — see `app/cek/page.tsx`'s header comment. Locking this copy does not authorize un-gating the page.

- Page heading: `Cek rekening atau nomor HP`
- Lookup mode tabs: `Rekening` / `Nomor HP`
- Bank field label: `Bank`
- Rekening field label: `Nomor rekening`
- Phone field label: `Nomor HP` — deliberately not "Nomor HP Anda" (§12's join-flow wording): that phrasing assumes the visitor is entering their own number, which isn't true here, where the number being checked could be anyone's.
- Submit button: `Cek riwayat`
- Error, invalid input: `Masukkan bank dan nomor rekening, atau nomor HP yang valid.`
- Error, rate-limited (anti-enumeration guard, not a per-user abuse limit): `Terlalu banyak permintaan. Coba lagi dalam beberapa menit.`
- Result line format: extends §2's forced-check line to the full 8-bucket set per data-model.md's profile-page spec — `[identifier] · [N] selesai · [N] dibatalkan bersama · [N] tidak dilanjutkan · [N] kedaluwarsa · [N] dikembalikan penuh · [N] dikembalikan sebagian · [N] tidak dipenuhi · [N] klaim berbeda aktif · tercatat sejak [tgl]`
- Empty state: reuses §2's locked line verbatim, unmodified: `Belum ada riwayat di SAKSI. Ini bukan jaminan aman. Sebagian besar rekening belum tercatat.`

**Waiting-state fill-ins (the non-active-party side of each merged status page; not explicitly specced in the original build order, minimal placeholders):**
- Penjual waiting at DISEPAKATI: `Menunggu pihak pembeli mengunggah bukti transfer.`
- Pembeli waiting at DIBAYAR_DIKLAIM: `Menunggu konfirmasi penerimaan dari pihak penjual.`

---

## §20 — "Tagihan" reframe of the seller create-and-send surface (2026-07)

**Decision & boundary (read before touching any of this).** The seller's mental
model at entry is "I am making an invoice (tagihan) to send to my buyer." So the
**create-and-send surface** uses `tagihan`. Everything about the *witnessed
mutual agreement and its outcome* stays `kesepakatan`, because that is what SAKSI
legally records and publishes — renaming those would make the app claim to record
something it doesn't, violating the one invariant.

**Surface → word (locked):**
- **Tagihan** (seller's artifact, create + send): landing page, `/buat` create
  form, and the deal-link/share card.
- **Kesepakatan** (the witnessed agreement — DO NOT reframe): all breach/flag
  publication (§ breach ladder), the T&C and attestations, the lifecycle event
  log / timeline, WA notifications, join/consent record lines, and every
  "tidak dipenuhi / disetujui / dibatalkan / kedaluwarsa" outcome string.

**New / changed strings:**
- Landing (`app/page.tsx`): heading `Buat tagihan buat pembeli kamu.`; subhead
  `Isi barang, harga, dan rekening kamu. Kirim link-nya ke pembeli — bukan nomor
  rekening. Tiap pembayaran tercatat otomatis.`; steps `Isi tagihan` /
  `Kirim link-nya ke pembeli` / `Pembeli bayar & upload bukti`; CTAs `Buat
  Tagihan` / `Cek Rekening`. (Truthful, no "aman"/"terpercaya"/guarantee.)
- Create form (`app/buat/page.tsx`): title `Buat Tagihan`; intro `Isi tagihan
  buat pembeli kamu. Nanti kamu dapat link buat dikirim ke mereka.`; section
  labels `Data kamu` / `Barang & harga` / `Rekening pembayaran kamu`; submit
  `Buat Tagihan`; defaults `proposer_role` to PENJUAL (seller-first).
- Share card (`lib/copy.ts`): `DEAL_LINK_CARD_HEADING = 'Link tagihan ini'`;
  `DEAL_LINK_SAVE_HINT = 'Simpan link ini. Tanpa link, tagihan tidak dapat
  dibuka kembali.'`; WA share text prefix `Tagihan SAKSI:` (DealLinkCard.tsx).

Server contract unchanged (all form field names identical). Engine, state
machine, anchoring, and the invariant untouched.

---

## §21 — Buyer join-and-pay flow simplification (2026-07, corrected 2026-07-21
after code review)

**Decision & scope.** The create form now defaults `proposer_role` to `PENJUAL`
(§20), so the **only UI-reachable path** to a DRAF deal's join screen is one where
the counterpart joining is the payer. **This does NOT make PEMBELI-proposed deals
impossible** — an earlier draft of this section claimed it did and shipped UI that
deleted the counterpart's ability to complete that path; that was wrong and was
caught in review before merge. `app/buat/actions.ts`'s `validRoles` still accepts
`PEMBELI`, and `app/deal/[token]/actions.ts` still requires
`rekening_tujuan`/`rekening_bank` from the counterpart whenever
`deal.proposer_role === 'PEMBELI'` (C2 — the proposer never had a rekening to give
at create time in that case). **What actually shipped: the `needsRekening` branch
is kept, fully functional, gated exactly as before** — this section only changes
copy and layout on top of it, for the common (only-reachable-via-UI) case where
`needsRekening` is false: **(1) masukkan nomor HP, (2) langsung lihat rekening
tujuan + riwayatnya + tombol salin, (3) kirim bukti pembayaran.**

**This supersedes §12's join-form heading/instruction** (kept there verbatim for
historical reference; the new strings are what ships). Both are **role-neutral on
purpose** — neither names a specific role — so they read correctly whether the
joiner ends up in the `needsRekening` branch or not:
- `JOIN_FORM_HEADING` → `'Masukkan nomor HP kamu untuk melihat rekening
  pembayaran.'`
- `JOIN_DEAL_INSTRUCTION` → `'Nomor HP kamu akan tercatat sebagai pihak dalam
  kesepakatan ini. Centang pernyataan di bawah untuk melanjutkan.'` (corrected —
  the first version of this string hardcoded "pihak pembeli," which is wrong when
  the joiner is actually PENJUAL, i.e. exactly the `needsRekening` case.)
- New: `JOIN_SUBMIT_LABEL = 'Lihat Rekening & Bayar'` — used only when
  `!needsRekening` (this joiner is about to pay). `JOIN_SUBMIT_LABEL_NEEDS_REKENING
  = 'Bergabung ke Kesepakatan'` — the original, role-neutral label, used when
  `needsRekening` is true (this joiner is the seller supplying a rekening, not
  paying — "& Bayar" would be inaccurate for them).

**Structural changes (no copy, but changes what's on screen — recorded here since
they're part of the same decision):**
- `JoinDealForm.tsx`: the `needsRekening` prop and its bank/rekening input branch
  (with field-error display) are **restored, unchanged from the original
  implementation** — not deleted. The `ATTESTATIONS` fine print + single
  `attest_tc` checkbox + `PrivacyLink` are kept **verbatim** (§4's consent
  requirement is untouched) with the `<legend>Pernyataan</legend>` accessible group
  name intact and at the app's existing `text-xs text-zinc-500` contrast level
  (matches hints/errors elsewhere, passes WCAG AA) — a since-reverted intermediate
  draft had dropped the legend and recolored this to `text-zinc-400`/11px
  (~2.5:1 contrast, fails AA); that regression did not ship.
- `DisepakatiPanel.tsx`: the small duplicate "Ringkasan Kesepakatan" card
  (item_desc + amount) is removed from this panel — `page.tsx`'s top-level summary
  card already shows the same two facts (plus rekening/deadline/roles) once, above
  this panel, for every status. Removing the repeat means a freshly-joined payer's
  `IdentifyPartyGate` short-circuit (via the existing party-session cookie +
  persisted phone — unchanged) lands directly on the rekening/history/copy/bukti
  `PaymentForm`, with nothing above it but the page's single existing summary. This
  part of the change is unaffected by the correction above — it doesn't touch the
  `needsRekening` question either way.
- `page.tsx` top summary card: the `Tier: {TIER_LABELS[deal.tier]}` line is
  removed (tier is now always `GRATIS` per §20 — a line that always reads "Tier:
  Gratis" is noise, not information). The `Peran pengaju` / `Peran pihak penerima`
  lines are kept (they tell the buyer which side they are). The `needsRekening`
  prop is passed to `JoinDealForm` exactly as before
  (`deal.proposer_role === 'PEMBELI'`).

Server contract, state machine, the atomic `join_deal_with_event` RPC, hash
chaining, and anchoring are all **untouched** — this section changes presentation
only, on top of a fully-intact backend contract.

---

## §22 — PENJUAL-only enforced at the data layer (2026-07-21, supersedes §21's
`needsRekening` restoration)

**What changed and why.** §21's fix kept `needsRekening` alive because, at the
time, `app/buat/actions.ts`'s `validRoles` still accepted `PEMBELI` — so a
PEMBELI-proposed deal was a real, creatable state, and deleting the counterpart's
only way to complete one (as an earlier draft had done) was a genuine bug, not
cleanup. That was the correct fix **given that constraint**. But the constraint
itself was never a decision anyone had actually made for this product — SAKSI is,
by every doc in `docs/01-PRODUCT-THESIS-AND-RESEARCH.md` through
`docs/07-CURRENT-APP-AND-CHANGES.md`, a **seller-invoice tool**: the seller always
proposes, the counterpart is always the payer. `validRoles` accepting `PEMBELI`
was inherited from an earlier, more generic "kesepakatan between any two roles"
design that predates the tagihan pivot, and kept being defended defensively
(§20's UI default, §21's restored branch) instead of ever being closed at the
source.

**The actual fix:** `app/buat/actions.ts`'s `validRoles` is now `['PENJUAL']`
only. A hand-crafted POST can no longer create a PEMBELI-proposed deal, so "the
counterpart joining a deal is always the payer" is now **true by construction**,
not a UI default hoping the backend agrees. This is the invariant roughly 14 call
sites across `paymentActions.ts`, `breachActions.ts`, the deadline-sweep cron, and
every status panel already silently assumed via
`deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart'` ternaries — those
are left as-is (they now always resolve the same branch; harmless, mechanical
verbosity, not a correctness issue, and not touched in this pass to avoid a
wide, hard-to-verify sweep through the legally-sensitive breach pipeline for no
behavioral gain).

**Consequence — `JoinDealForm.tsx`'s `needsRekening` branch is now genuinely,
permanently dead** (not "unreachable via the only UI path today," but
structurally impossible to reach at all) **and has been removed for real**, this
time correctly: `needsRekening` prop, the bank/rekening input branch, its field
errors, and the `BANK_OPTIONS`/`BANK_OTHER_VALUE` imports are all gone. `page.tsx`
no longer passes `needsRekening` to `JoinDealForm`. `app/deal/[token]/actions.ts`'s
`joinDeal` no longer has a `counterpartSuppliesRekening` branch — `rekeningTujuan`/
`rekeningBank` are always `null` going into the RPC, which already fell back to
the deal's existing rekening in that case (unchanged RPC behavior).

**Copy simplified to match — one label, not two:**
- `JOIN_FORM_HEADING` unchanged from §21: `'Masukkan nomor HP kamu untuk melihat
  rekening pembayaran.'`
- `JOIN_DEAL_INSTRUCTION` → `'Nomor HP kamu akan tercatat sebagai pihak pembeli.
  Centang pernyataan di bawah untuk melanjutkan.'` — now correctly names the role
  (§21 had deliberately kept this role-neutral because the PEMBELI-proposed case
  was still real at the time; now it isn't, so naming the role is accurate again).
- `JOIN_SUBMIT_LABEL = 'Lihat Rekening & Bayar'` — the only submit label; §21's
  `JOIN_SUBMIT_LABEL_NEEDS_REKENING` fallback is removed, nothing reaches that
  branch anymore.

**What this resolves, plainly:** every prior pass on this flow (§20, §21) treated
the old repo's generic role-pair machinery as ground truth to work around,
producing a cycle of delete-the-UI-branch → code review catches the backend still
permits it → restore-the-branch-defensively. §22 breaks that cycle by making the
actual product decision (seller-only) real at the one place — `validRoles` — that
everything else was silently assuming, instead of continuing to patch around a
door that was never supposed to be open.

Server contract for the reachable path, state machine, the atomic
`join_deal_with_event` RPC, hash chaining, and anchoring are all still
**untouched**. The `proposer_role` column, `ROLE_LABELS`, and `ROLE_PAIR` are
left in place (harmless — `ROLE_LABELS`/`ROLE_PAIR` still carry
`PEMBERI_PINJAMAN`/`PEMINJAM`/`PEMILIK`/`PENYEWA` entries for the gated
`pinjam-meminjam`/`sewa-menyewa` designs in `data-model.md`, which remain
explicitly deferred, not part of the active/validated role set).

## §23 — Locked-invoice presentation pass (2026-07-21)

Interface-only pass. The state machine, the server contract, the hash/anchor
layer, and the tier spec are all **untouched**. Two locked strings widen, and
the buyer's deal surface is re-presented as an invoice rather than a summary.

### The two string changes

- `PAYMENT_NOT_RECEIVED_LABEL`: `'Dana belum masuk'` →
  **`'Dana belum masuk / bukti salah'`**.
  The action already covered two situations — money that never landed, and a
  bukti that does not match this deal — but named only the first, leaving a
  penjual looking at a mismatched bukti with no obvious control. Still not an
  accusation, still writes no `deal_events` row, and `PAYMENT_NOT_RECEIVED_ACK`
  is unchanged and remains accurate for both readings.

- `LEDGER_DETAIL_LINK_LABEL`: `'Lihat detail lengkap'` →
  **`'Lihat detail lengkap history rekening'`**.
  Under the locked-link flow the buyer never types a rekening themselves, so
  this expander is the only route to the destination account's own record. The
  old label did not say what the detail was *about* and read as "more detail
  about this invoice". Naming the rekening is what makes the forced-check
  meaningful when the buyer never performed a lookup of their own.

### Why the invoice framing (not new claims)

The link is created and locked by the penjual; the buyer edits nothing. The
protection that a cold rekening-lookup used to provide is therefore moved onto
the invoice itself: the destination account's record is surfaced directly under
**Rekening tujuan**, at the moment of payment, expandable via the renamed link
above.

This adds no new assertion. `formatAccountHistory` and
`FORCED_CHECK_EMPTY_STATE` are reused verbatim, and the empty state stays
neutral — "Belum ada riwayat di SAKSI. Ini bukan jaminan aman." — never "aman".
An invoice that looks like a real tagihan must not become an invoice that
*vouches* for anyone: the presentation changed, the claims did not.

### New UI chrome (not legally adjacent, same category as §12's approved-inline labels)

- `INVOICE_EYEBROW = 'Tagihan · SAKSI'`
- `INVOICE_WITNESS_MARK = 'Saksi menyaksikan transaksi ini'`
- `INVOICE_LOCKED_NOTE = 'Link dari penjual · terkunci'`
- `INVOICE_NUMBER_LABEL = 'No. tagihan'`
- `INVOICE_FOR_LABEL = 'Untuk'`

The witness mark states what SAKSI is doing (recording), never what the deal
is (safe). "Menyaksikan" is the whole product in one word and carries no
guarantee.

## §24 — "Dana belum masuk / bukti salah" becomes a recorded statement (2026-07-21, migration 0029)

**What it was.** The penjual tapped one button and the only consequence was a
best-effort WhatsApp nudge at the pembeli. No `deal_events` row, no persisted
text, nothing on the record. The UI then reported the *delivery state of that
message* — "Notifikasi terkirim", or on failure "Percobaan mengirim notifikasi
WA tidak berhasil."

**Why that was wrong.** Two ways. When the WA channel was down the pembeli
learned nothing at all, so a genuine disagreement existed only in the seller's
head and vanished. And the seller was shown a notification-integration failure,
which is not a fact about their deal and not something they can act on.

**What it is now.** The penjual writes what actually happened and that
keterangan is recorded, hash-chained, and shown to the pembeli on their own
status page. The record carries the disagreement instead of a messaging channel
carrying it.

Still **not** a breach report: `DANA_BELUM_MASUK` is a self-transition on
`DIBAYAR_DIKLAIM`. No flags row, no status change, no publication, no deadline
effect. It is one party's attributed account sitting next to the other party's
bukti claim, so a reader can see both sides and see that they disagree. The
breach pipeline is untouched and still gated on the deadline actually lapsing.

Note text lives in `deal_statements` (RLS, service-role only); the event payload
carries only a SHA-256 of it — same split as `breach_notes` (§0020).

**Retired:** `PAYMENT_NOT_RECEIVED_ACK`, `ERROR_NOTIFY_SEND_FAILED`,
`PAYMENT_NOT_RECEIVED_UNDELIVERED`, `formatPaymentNotReceivedMessage`. All four
described the delivery state of a WhatsApp message.

**New:** `DANA_BELUM_MASUK_HEADING`, `_PROMPT`, `_PLACEHOLDER`, `_SUBMIT_LABEL`,
`_CONSEQUENCES`, `_RECORDED`, `STATEMENT_FROM_PENJUAL_LABEL`,
`STATEMENT_FROM_PEMBELI_LABEL`, `ERROR_STATEMENT_*`.

## §25 — WA OTP removed from the breach path (2026-07-21)

Filing a report was three steps: write the note, request a WA code, enter the
code, submit. It is now one step.

**Why.** The OTP sat on the WhatsApp channel, so an outage in a *notification
integration* blocked the wronged party from recording a complaint at all. That
is the worst available failure mode for this product: the whole point is that
the record exists when someone is harmed.

**What identity still means on these paths.** `identifyPartyByPhone`, re-derived
server-side on submit, same as every other action — it proves the filer is a
party to this deal. It does **not** prove they currently possess that number.

**Copy corrected accordingly.** `BARANG_TIDAK_SESUAI_CONSEQUENCES`' last bullet
used to read *"Nomor HP pelapor terverifikasi. Laporan palsu juga tercatat
permanen atas nomor ini."* The first sentence became false the moment the OTP
went; it is removed. The second is kept, reworded to name what is actually true:
*"Laporan palsu juga tercatat permanen atas nomor HP yang tercatat sebagai pihak
dalam kesepakatan ini."*

**Retired:** the whole `OTP_*` string set, `formatOtpMessage`, `lib/otp.ts`, and
the `OTP_BREACH_REPORT` WA template.

**Left in place deliberately:** the `otp_codes` table (0020) — dropping a table
is irreversible, keeping an unused one is free.

⚠ **Dormant strings that are now false if ever shipped:** `TIER_LIMA_RIBU_DESC`,
`TIER_LABELS.LIMA_RIBU`, and `FLAG_BODY_STEM.LIMA_RIBU` all promise phone
verification whose only implementation has been removed. None are rendered today
(no tier selector; every deal is GRATIS). Do not ship that tier without first
rebuilding a verification mechanism.

## §26 — Buyer flow merged into one page (2026-07-21)

The buyer opened a payment link and the first thing they saw was a bare phone
field. The destination account, and that account's record, only appeared on a
*later* screen — after they had already handed over a phone number.

That ordering defeated the forced check (Law 7). The check is only worth
anything before the buyer decides to trust the seller, not at the moment they
tap upload. So the rekening and its full record now render immediately,
server-side, with no gate in front of them — masked, since the page is reachable
by anyone holding the link.

The phone field stays, and stays before the *unmasked* number, because entering
it is what records the buyer as a party to this deal. But it is one section
inside the page they are already reading, not a wall in front of it.

**Also removed from the buyer's view:** the deal-link card ("Link tagihan ini /
Simpan link ini"). It is the seller's tool for re-sharing the capability URL; the
buyer arrived *via* that link and is not the one distributing it. It now renders
for the proposer only.

**New:** `formatAccountHistoryCounts` — the counts half of
`formatAccountHistory`, for surfaces that already render the bank and masked
number as their own heading. A projection of that locked string, same words,
same order. Do not reconstruct it by string-replacing the prefix out of
`formatAccountHistory`'s output.

## §27 — Time display, and the deadline as an instant (2026-07-21)

**Every timestamp now carries its zone.** `formatDateTime` rendered
"21 Juli 2026, 09.34" with no zone marker. For a record whose purpose is to be
shown to a third party during a dispute, a bare wall-clock time is ambiguous —
Indonesia spans WIB/WITA/WIT. UU ITE Pasal 6/15/16 conditions an electronic
record's evidentiary weight on keautentikan/keutuhan and on the system being
able to display it back intact; a timestamp readable two ways fails that on its
face. Standard audit-log practice agrees: store UTC, render with an explicit
zone.

Storage was already correct (`deal_events.created_at` is `timestamptz`, an
absolute UTC instant). Only display changed, and it always pins to Asia/Jakarta
rather than the viewer's local zone, so both parties reading the same record see
the identical string.

- `formatTimeWib` — "21 Jul 2026, 09.34 WIB". Timeline rows, step times.
- `formatTimeWibPrecise` — to the second. For establishing ordering between two
  close events.
- `formatDeadlineWib` — **"28 Juli 2026, 23.59 WIB"**.

**On that 23.59.** `deals.deadline` is a naive WIB calendar date and the breach
gate is `deadline < getTodayWib()` — strictly less than, so a party has the whole
of the deadline date and eligibility opens at 00.00 the following day. The last
moment inside the window is therefore 23.59 WIB on the deadline date. Do not
"simplify" this to 00.00 of the deadline date: that states a cutoff a full day
earlier than the code enforces.

**The deadline is now shown at all.** It was auto-derived (creation + 7 days) and
never displayed, so neither party knew the window. `BUAT_DEADLINE_LABEL` /
`BUAT_DEADLINE_NOTE` state it read-only on the create form — read-only because
the server derives it and would ignore a submitted value.

**Progress display.** `DealProgressStepper` + `LiveIndicator` are replaced by one
`DealProgress`: two compact lines by default (the old stepper ate a third of the
first screen and pushed the invoice below the fold), the live-update signal
carried on the current bead as a pulse rather than in a detached pill, and an
expand that reveals each step with its WIB timestamp from `deal_events`. It
displays event times; it computes nothing.

## §28 — Review pass on §23–§27, before commit (2026-07-21)

Manual review (no DeepSeek key available; reviewed against this file's own
Laws/Golden-Rules directly) turned up two real issues in the §23–§27 work,
both fixed here, plus one operational gap that isn't a code bug but will
break the feature silently if missed.

**Fixed — redundant rekening display.** `BuyerJoinGate.tsx`'s first version
repeated the masked account number: `InvoiceCard` already renders
"Rekening tujuan: {bank} {masked}" as one of its own rows, directly above
`BuyerJoinGate` in the render tree, and `BuyerJoinGate` printed the same
masked number again under its own "Rekening tujuan" heading right below it.
That is exactly the wasted-space problem §26 was supposed to fix. Retitled
to "Riwayat rekening ini" and dropped the duplicate number — the card's only
job is the part `InvoiceCard` doesn't cover, the account's history.

**Fixed — stale locked-spec docs.** `data-model.md`'s "Breach → flag
pipeline" section and `integrations.md`'s §2 both still described the
breach-report WA OTP as a live, required mechanism after §25 removed it —
`data-model.md` even repeated the exact "every flag has a traceable
reporter" claim that made `BARANG_TIDAK_SESUAI_CONSEQUENCES`' now-corrected
bullet false. These are two of the four files this repo's own `CLAUDE.md`
says to read before touching a flow ("read before wiring any external
service" / locked product decisions) — leaving them stale risked a future
pass reintroducing the OTP gate on the strength of a doc that no longer
matches what was actually decided. Both corrected with a pointer back to
§25.

**Since applied:** Migration 0029 was flagged here as written-but-unapplied;
it was pushed to the live DB via `npx supabase db push` immediately after this
review (confirmed via `supabase migration list` showing `remote: 0029`). See
`ops.md`.
- **`DanaBelumMasukForm` allows one statement submission per page load.**
  Once `state.recorded` is true from `useActionState`, the component locks
  to the confirmation card with no way to open the form again without a
  reload — even though the migration's own design explicitly anticipates a
  seller needing to add a second statement ("a second transfer arrived, the
  first statement was wrong"). Low severity (a reload is always available),
  left as a known gap rather than patched reflexively.
- **`/buat`'s deadline preview can go stale.** `getDefaultDeadlineWib()` is
  read once on mount for display; `createDeal` recomputes it fresh at actual
  submission time. If a seller leaves the form open for an unusually long
  time before submitting, the previewed date and the persisted deadline can
  differ. `BUAT_DEADLINE_NOTE`'s "sejak tagihan dibuat" wording is technically
  accurate about the mechanism either way; the displayed date itself carries
  no "estimated" qualifier. Low practical impact (forms are typically filled
  in minutes), noted rather than engineered around.

**Confirmed correct, not a bug:** `DealLinkCard` no longer rendering for the
buyer (only the proposer, in the desktop rail) was checked against §26's own
"lost link = lost deal" rationale and looked at first like a regression —
but it is exactly what was asked for (remove the "Simpan link ini" card from
the middle of the buyer's page), and the buyer's own copy of the link already
persists in the WhatsApp thread that delivered it to them, which
`DealLinkCard` never was the only source of. Checked, not reverted.
