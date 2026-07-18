# SAKSI — Locked Indonesian Copy

Use these strings VERBATIM. They are legal load-bearing surfaces; paraphrasing them changes their truth-conditions. `[...]` = interpolated values.

## 1. Flag ladder (state-dependent — select by record state, never hardcode one)

**Rung 0 — payment claimed only:**
> Bukti transfer diklaim pelapor — belum dikonfirmasi pihak terlapor, belum diverifikasi bank.

**Rung 1 — counterpart confirmed receipt in-flow:**
> Pembayaran dikonfirmasi kedua pihak — belum diverifikasi bank.

**Rung 2 — open-banking verified (roadmap; do not ship enabled):**
> Pembayaran terverifikasi mutasi bank.

**Flag body templates by tier** (prepend the correct rung line):
- GRATIS: `1 kesepakatan tercatat tidak dipenuhi ([tgl]). Identitas para pihak tidak diverifikasi. Terlapor tidak merespons dalam 14 hari.`
- LIMA_RIBU: `1 kesepakatan tercatat tidak dipenuhi ([tgl]). Nomor HP kedua pihak terverifikasi. Terlapor tidak merespons dalam 14 hari.`
- BERMETERAI: `1 kesepakatan bermeterai tidak dipenuhi ([tgl]). Identitas terverifikasi (e-KYC). Dokumen siap diajukan sebagai bukti. Terlapor tidak merespons dalam 14 hari.`
- DISPUTED suffix (replaces the last sentence when hak jawab filed): `Terlapor membantah laporan ini. Status: dalam sengketa.`

## 2. Forced-check page (payer, before copy-rekening activates)

**With history:**
> Rekening tujuan: [bank] [rekening_masked] · [N] kesepakatan selesai · [N] tidak dipenuhi · tercatat sejak [bulan tahun]

**Empty state (MUST show, never soften):**
> Belum ada riwayat di SAKSI — ini bukan jaminan aman. Sebagian besar rekening belum tercatat.

**Copy button label (disabled → enabled):** `Lihat riwayat dulu` → `Salin nomor rekening`

## 3. Attestations (4 individual checkboxes at record creation, both parties; not bundleable)

1. `Saya berusia 18 tahun ke atas dan cakap hukum untuk membuat kesepakatan ini.`
2. `Nomor HP dan rekening yang saya masukkan adalah milik saya sendiri.`
3. `Saya setuju data pengenal saya (nomor HP, nomor rekening) diproses untuk pencatatan kesepakatan dan pencocokan pola penipuan.`
4. `Saya memahami SAKSI hanya mencatat kesepakatan — tidak menahan dana, tidak menjamin pihak lain, dan tidak menjamin pengembalian dana.`

**Bundled T&C line (single checkbox):** `Saya menyetujui Syarat & Ketentuan SAKSI, termasuk publikasi catatan wanprestasi, proses hak jawab, dan larangan bukti palsu.`

**At bukti upload (blocking checkbox):**
> Bukti yang saya unggah asli dan belum diubah. Mengunggah bukti palsu adalah tanggung jawab hukum saya.

## 4. N8 refund warning (refund screen, always visible, not dismissible)

> Pengembalian dana tidak pernah memerlukan transfer tambahan dari Anda. Jika Anda diminta membayar lagi agar dana "cair", itu ciri penipuan.

## 5. OCR verdict labels (never say "asli" / "terverifikasi")

- `KONSISTEN`: `Bukti konsisten dengan kesepakatan (nominal, tanggal, rekening tujuan cocok). Pemeriksaan konsistensi — bukan verifikasi bank.`
- `TIDAK_KONSISTEN`: `Bukti tidak konsisten dengan kesepakatan: [field yang beda]. Periksa kembali sebelum melanjutkan.`
- `TIDAK_TERBACA`: `Bukti tidak dapat dibaca otomatis. Dicatat sebagai klaim tanpa pemeriksaan konsistensi.`

## 6. Tier cards

- GRATIS — `Catat kesepakatan. Rekening tujuan terekam dari bukti transfer.`
- LIMA_RIBU — `Rp5.000/pihak · Nomor HP kedua pihak terverifikasi (OTP WhatsApp).`
- BERMETERAI — `Rp50.000/pihak · Identitas terverifikasi (e-KYC) + meterai elektronik + berkas bukti siap ajukan.`
- Shared footer: `Tier menentukan bobot pembuktian, bukan tingkat keamanan. Melaporkan wanprestasi selalu gratis di semua tier.`

## 7. Extension & exit-state record lines (public record wording)

- PERPANJANGAN: `Batas waktu diperpanjang ke [tgl], disepakati kedua pihak.`
- DIBATALKAN_BERSAMA: `Dibatalkan atas kesepakatan bersama ([tgl]).`
- DIBATALKAN_SEPIHAK_PRA_BAYAR: `Disepakati [tgl]; dibatalkan sepihak sebelum pembayaran.`
- DIKEMBALIKAN_PENUH: `Dibatalkan; dana dikembalikan penuh, dikonfirmasi kedua pihak ([tgl]).`
- SENGKETA silence: `Terlapor tidak merespons dalam 14 hari.`

## 8. Trust-washing guards

- New profile banner: `Akun baru — belum ada riwayat di SAKSI.`
- FORBIDDEN WORDS anywhere in UI applied to a party, profile, or record: `aman`, `terpercaya`, `terverifikasi aman`, `bebas penipuan`, any score, stars, or safety colors (green check on a profile). "Terverifikasi" may only modify a *fact* (nomor HP terverifikasi, identitas terverifikasi), never a *person's character*.
- Canonical-domain line in badge/share card: `Cek keaslian catatan hanya di saksi.app — bukan .com, bukan .id, bukan yang lain.`

## 9. OTP message (WA authentication template)

*Sender identity: the WhatsApp Business display name is `SAKSI (saksi.app)` — the domain in the sender name is part of the anti-phishing story; keep it consistent everywhere.*

> Kode verifikasi SAKSI Anda: [kode]. Berlaku 5 menit. Jangan bagikan kepada siapa pun, termasuk pihak yang mengaku dari SAKSI.

## 10. Meterai mock label (demo only)

> Simulasi meterai elektronik — integrasi distributor resmi Peruri pada rilis produksi. Dokumen ini belum bermeterai.
