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
