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

**Bundled T&C line (single checkbox):** `Saya menyetujui Syarat & Ketentuan SAKSI, termasuk publikasi catatan wanprestasi, proses hak jawab, dan larangan bukti palsu.`

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
- Shared footer: `Tier menentukan bobot pembuktian, bukan tingkat keamanan. Melaporkan wanprestasi selalu gratis di semua tier.`

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

## 10. Meterai mock label (demo only)

> Simulasi meterai elektronik. Integrasi distributor resmi Peruri pada rilis produksi. Dokumen ini belum bermeterai.

## 11. Landing tagline (landing page subheading + meta description — must be identical)

> Percaya itu baik. Tercatat lebih baik.

## 12. Deal state UI (join flow)

**Join form heading (visible to all viewers with the link in DRAF state):**
> Masukkan nomor HP Anda untuk bergabung sebagai pihak penerima.

**Join form instruction (visible to all viewers with the link in DRAF state):**
> Nomor HP yang Anda masukkan akan tercatat sebagai pihak dalam kesepakatan ini. Centang semua pernyataan di bawah untuk melanjutkan.

**DIAJUKAN status line (shown after both parties joined, awaiting acceptance):**
> Kedua pihak tercatat. Menunggu persetujuan kedua pihak.

**Self-join error (counterpart phone matches proposer phone):**
> Nomor HP ini sudah digunakan untuk membuat kesepakatan ini. Masukkan nomor HP pihak lain.

**Deal-save failure (atomic RPC failed; shown on create and on join):**
> Gagal mencatat kesepakatan. Coba lagi.

**Join technical failure (RPC failed for a non-race reason — network/DB error; distinct from "already closed" race):**
> Gagal bergabung. Coba lagi.

**Accept step (DIAJUKAN, phone re-entry to identify which party — reuses the join
form heading above, no separate instruction line since there are no checkboxes on
this screen):**

**Accept button label:**
`Setuju`

**Already-accepted status line (this party already has their flag set):**
> Anda sudah menyetujui. Menunggu persetujuan pihak lain.

**Wrong-phone error (phone matches neither the proposer nor the counterpart):**
> Nomor ini tidak terdaftar pada kesepakatan ini.

**DISEPAKATI placeholder (shown once both parties have accepted; replaced by the
real DISEPAKATI screen in a later slice):**
> Kesepakatan telah disetujui kedua pihak.

**Accept technical failure (RPC failed for a real reason — network/DB error;
distinct from the RPC succeeding with 0 rows affected, which is the
already-accepted state above, not an error):**
> Gagal menyetujui. Coba lagi.

**Too-many-attempts (phone-guess rate limit on the accept step):**
> Terlalu banyak percobaan. Coba lagi nanti.

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

## 15. Description-field placeholder (buat form, by proposer role)

| Role | Placeholder |
|---|---|
| PENJUAL / PEMBELI (Jual-beli) | `Contoh: "Preorder album [nama grup], termasuk photocard, dikirim setelah rilis."` |
| PEMBERI_PINJAMAN / PEMINJAM (Pinjam-meminjam) | `Contoh: "Pinjaman Rp2.000.000, dikembalikan dalam 30 hari."` |
| PEMILIK / PENYEWA (Sewa-menyewa) | `Contoh: "Sewa kos bulan Agustus, masuk tanggal 1."` |
| LAINNYA / belum dipilih | `Contoh: "Jelaskan kesepakatan secara singkat dan jelas."` |
