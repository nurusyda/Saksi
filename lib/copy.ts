// Canonical source for all user-facing Indonesian copy.
// Strings are verbatim from .claude/skills/saksi-builder/references/copy-id.md.
// No em dashes. Do not paraphrase.

export const ATTESTATIONS: readonly string[] = [
  'Saya berusia 18 tahun ke atas.',
  'Nomor HP dan rekening yang saya masukkan milik saya sendiri.',
  'Saya setuju data saya diproses untuk pencatatan dan pencocokan riwayat kesepakatan.',
  'Saya paham SAKSI hanya mencatat, tidak menahan dana atau menjamin pihak lain.',
];

export const TC_LABEL =
  'Saya menyetujui Syarat & Ketentuan SAKSI: publikasi kesepakatan tidak terpenuhi, hak menjawab dalam 14 hari jika dilaporkan, dan larangan bukti palsu.';

// copy-id.md §15 — description-field placeholder by proposer role.
// PENJUAL/PEMBELI shortened 2026-07-20: direct shorthand replaces the
// long-form "Contoh: …" examples so the input reads as an instruction
// rather than a sample. Other roles unchanged (not yet selectable).
export const ITEM_DESC_PLACEHOLDER: Record<string, string> = {
  PENJUAL: 'Jual ………, banyaknya ………',
  PEMBELI: 'Beli ………, banyaknya ………',
  PEMBERI_PINJAMAN: 'Contoh: "Pinjaman Rp2.000.000, dikembalikan dalam 30 hari."',
  PEMINJAM: 'Contoh: "Pinjaman Rp2.000.000, dikembalikan dalam 30 hari."',
  PEMILIK: 'Contoh: "Sewa kos bulan Agustus, masuk tanggal 1."',
  PENYEWA: 'Contoh: "Sewa kos bulan Agustus, masuk tanggal 1."',
  LAINNYA: 'Contoh: "Jelaskan kesepakatan secara singkat dan jelas."',
};

// copy-id.md §13 — role labels (cross-file: buat/page.tsx + deal/[token]/page.tsx)
export const ROLE_LABELS: Record<string, string> = {
  PENJUAL: 'Penjual',
  PEMBELI: 'Pembeli',
  PEMBERI_PINJAMAN: 'Pemberi Pinjaman',
  PEMINJAM: 'Peminjam',
  PEMILIK: 'Pemilik',
  PENYEWA: 'Penyewa',
  LAINNYA: 'Lainnya',
};

// copy-id.md §13 — complementary-role map for counterpart display
// null means no defined counterpart role — render "Pihak lain" without a specific label
export const ROLE_PAIR: Record<string, string | null> = {
  PENJUAL: 'PEMBELI',
  PEMBELI: 'PENJUAL',
  PEMBERI_PINJAMAN: 'PEMINJAM',
  PEMINJAM: 'PEMBERI_PINJAMAN',
  PEMILIK: 'PENYEWA',
  PENYEWA: 'PEMILIK',
  LAINNYA: null,
};

// copy-id.md §13 — counterpart role display strings
export const ROLE_PAIR_HELPER_PREFIX = 'Pihak lain akan tercatat sebagai:';
export const COUNTERPART_FALLBACK_LABEL = 'Pihak lain';

// copy-id.md §13 — tier short labels (cross-file: buat/page.tsx + deal/[token]/page.tsx)
export const TIER_LABELS: Record<string, string> = {
  GRATIS: 'Gratis',
  LIMA_RIBU: 'Rp5.000/pihak',
  BERMETERAI: 'Rp50.000/pihak',
};

// copy-id.md §6 — tier card descriptions (first line per tier)
export const TIER_GRATIS_DESC =
  'Catat kesepakatan. Rekening tujuan terekam dari bukti transfer.';

export const TIER_LIMA_RIBU_DESC =
  'Rp5.000/pihak · Nomor HP kedua pihak terverifikasi (OTP WhatsApp).';

export const TIER_BERMETERAI_DESC =
  'Rp50.000/pihak · Identitas terverifikasi (e-KYC) + meterai elektronik + berkas bukti siap diajukan.';

// copy-id.md §6 — shared footer below tier cards
export const TIER_FOOTER =
  'Tingkatan menunjukkan kekuatan verifikasi identitas kedua pihak, bukan keamanan kesepakatan. Mengajukan dan melihat laporan selalu gratis di semua tingkatan.';

// copy-id.md §6a — disabled deal-type role cards (create flow gating)
export const BELUM_TERSEDIA_LABEL = 'Belum tersedia';

// copy-id.md §6 — pre-existing shipped copy (Phase 0.6), was hardcoded only
// in the paid-tier disabled cards; centralized here since it's now also used
// on the jenis-transaksi disabled cards (Section B).
export const NOTIFY_ME_LABEL = 'Beri tahu saat tersedia.';

// copy-id.md §14 — deal-type names, extracted from the existing confirmation-
// label table rather than re-typed, for the jenis-transaksi selector.
export const DEAL_TYPE_LABELS: Record<'JUAL_BELI' | 'PINJAM_MEMINJAM' | 'SEWA_MENYEWA', string> = {
  JUAL_BELI: 'Jual-beli',
  PINJAM_MEMINJAM: 'Pinjam-meminjam',
  SEWA_MENYEWA: 'Sewa-menyewa',
};

// copy-id.md §6a — deal-type selector "coming soon" badge (locked 2026-07-20)
export const SEGERA_HADIR_LABEL = 'Segera hadir';

// copy-id.md §8 — canonical domain line for badge/share card/footer
export const CANONICAL_DOMAIN =
  'Cek keaslian catatan hanya di saksi.app, bukan .com, bukan .id, bukan yang lain.';

// copy-id.md §2 — forced-check empty state (never soften)
export const FORCED_CHECK_EMPTY_STATE =
  'Belum ada riwayat di SAKSI. Ini bukan jaminan aman. Sebagian besar rekening belum tercatat.';

// Account-history lookup failed (network/DB error) — distinct from the empty
// state on purpose. Never fall back to the empty-state line on error: that
// would let a transient failure hide real history behind a reassuring message.
export const ERROR_ACCOUNT_HISTORY_UNAVAILABLE =
  'Riwayat tidak dapat dimuat saat ini. Coba lagi.';

// copy-id.md §2 — account-history line (with history). A function, not a plain
// constant, since it has interpolated values; the template itself is locked.
export function formatAccountHistory(
  bank: string,
  rekeningMasked: string,
  selesaiCount: number,
  tidakDipenuhiCount: number,
  sinceLabel: string,
): string {
  return `Rekening tujuan: ${bank} ${rekeningMasked} · ${selesaiCount} kesepakatan selesai · ${tidakDipenuhiCount} tidak dipenuhi · tercatat sejak ${sinceLabel}`;
}

// copy-id.md §4 — refund warning (always visible, not dismissible)
export const N8_REFUND_WARNING =
  'Pengembalian dana tidak pernah memerlukan transfer tambahan dari Anda. Jika Anda diminta membayar lagi agar dana "cair", itu ciri penipuan.';

// copy-id.md §11 — landing page subheading + meta description (must be identical)
export const LANDING_TAGLINE = 'Percaya itu baik. Tercatat lebih baik.';

// copy-id.md §12 — deal join flow
export const JOIN_FORM_HEADING =
  'Masukkan nomor HP Anda untuk bergabung sebagai pihak penerima.';

export const JOIN_DEAL_INSTRUCTION =
  'Nomor HP yang Anda masukkan akan tercatat sebagai pihak dalam kesepakatan ini. Centang semua pernyataan di bawah untuk melanjutkan.';

export const STATUS_DIAJUKAN =
  'Kedua pihak tercatat. Menunggu persetujuan kedua pihak.';

export const ERROR_SELF_JOIN =
  'Nomor HP ini sudah digunakan untuk membuat kesepakatan ini. Masukkan nomor HP pihak lain.';

// Not in copy-id.md — repeated across joinDeal/acceptDeal in the same file;
// centralized to avoid the wording drifting between call sites.
export const ERROR_DEAL_NOT_FOUND = 'Kesepakatan tidak ditemukan.';
export const ERROR_DEAL_CLOSED = 'Kesepakatan ini sudah tidak dapat dimasuki.';

// copy-id.md §12 — accept step (DIAJUKAN -> DISEPAKATI)
export const ACCEPT_BUTTON_LABEL = 'Setuju';

export const STATUS_ALREADY_ACCEPTED =
  'Anda sudah menyetujui. Menunggu persetujuan pihak lain.';

export const ERROR_PHONE_NOT_IN_DEAL =
  'Nomor ini tidak terdaftar pada kesepakatan ini.';

export const STATUS_DISEPAKATI_PLACEHOLDER =
  'Kesepakatan telah disetujui kedua pihak.';

// Not in copy-id.md — accept-screen phone-guess rate limit (distinct from
// ERROR_RATE_LIMIT, which is specifically about the daily deal-creation cap;
// reusing that wording here would misstate what limit was actually hit).
export const ERROR_TOO_MANY_ATTEMPTS = 'Terlalu banyak percobaan. Coba lagi nanti.';

// record_party_acceptance RPC failed for a real reason (network/DB error) —
// distinct from the RPC succeeding but affecting 0 rows (STATUS_ALREADY_ACCEPTED).
export const ERROR_ACCEPT_FAILED = 'Gagal menyetujui. Coba lagi.';

// Cross-file duplicated UI chrome (JoinDealForm.tsx + AcceptDealForm.tsx) —
// not legally adjacent copy, but Law 3 still applies to identical strings
// used verbatim in more than one file.
export const PHONE_FIELD_LABEL = 'Nomor HP Anda';
export const PHONE_FORMAT_HINT = 'Format: 08xx atau +628xx';

// Cross-file duplicated submit-pending labels — found by monster_check
// (2026-07-19 batch): 'Memproses...' was independently typed in three
// SubmitButton components, 'Mencatat...' in two.
export const PENDING_DEFAULT_LABEL = 'Memproses...';
export const PENDING_SAVE_LABEL = 'Mencatat...';

// Validation errors — not in copy-id.md; in copy.ts because both action files use them
export const ERROR_PHONE_INVALID =
  'Nomor HP tidak valid. Gunakan format 08xx atau +628xx.';

export const ERROR_PARTY_SAVE_FAILED = 'Gagal mencatat pihak. Coba lagi.';

// Server-action error messages
export const ERROR_ATTESTATIONS_REQUIRED =
  'Semua pernyataan harus disetujui sebelum kesepakatan dapat dicatat.';

export const ERROR_RATE_LIMIT = 'Batas pencatatan hari ini tercapai.';
// copy-id.md §12 — atomic RPC failed (deal + event rolled back together)
export const ERROR_DEAL_SAVE_FAILED = 'Gagal mencatat kesepakatan. Coba lagi.';

// copy-id.md §12 — join RPC failed for a non-race reason (network/DB error)
// Distinct from the "already closed" race message which uses a hardcoded string.
export const ERROR_JOIN_FAILED = 'Gagal bergabung. Coba lagi.';

// ============================================================
// Section C (2026-07-19 batch) — locked strings, extracted from copy-id.md
// sections that existed before this batch but had no TS constant yet because
// the phases that needed them (forced-check page, bukti upload) hadn't been
// built.
// ============================================================

// copy-id.md §2 — copy-rekening button, disabled until history resolves
export const COPY_REKENING_DISABLED_LABEL = 'Lihat riwayat dulu';
export const COPY_REKENING_ENABLED_LABEL = 'Salin nomor rekening';

// Not in copy-id.md — transient post-click confirmation, not legally
// adjacent, but centralized per Law 3 discipline anyway.
export const COPY_REKENING_COPIED_LABEL = 'Tersalin';

// copy-id.md §3 — blocking attestation at bukti upload
export const BUKTI_ATTESTATION =
  'Bukti yang saya unggah asli dan belum diubah. Mengunggah bukti palsu adalah tanggung jawab hukum saya.';

// copy-id.md §5 — OCR verdict labels (never say "asli"/"terverifikasi").
// TIDAK_KONSISTEN carries copy-id.md's own [...] interpolation marker —
// found by monster_check rendering the literal bracketed placeholder
// unsubstituted. Use formatOcrVerdictLabel() below, not this map directly,
// wherever a verdict is actually displayed.
export const OCR_VERDICT_LABELS: Record<'KONSISTEN' | 'TIDAK_KONSISTEN' | 'TIDAK_TERBACA', string> = {
  KONSISTEN:
    'Bukti konsisten dengan kesepakatan (nominal, tanggal, rekening tujuan cocok). Pemeriksaan konsistensi, bukan verifikasi bank.',
  TIDAK_KONSISTEN: 'Bukti tidak konsisten dengan kesepakatan: [field yang berbeda]. Periksa kembali sebelum melanjutkan.',
  TIDAK_TERBACA: 'Bukti tidak dapat dibaca otomatis. Dicatat sebagai klaim tanpa pemeriksaan konsistensi.',
};

export function formatOcrVerdictLabel(
  verdict: 'KONSISTEN' | 'TIDAK_KONSISTEN' | 'TIDAK_TERBACA',
  mismatchedFieldLabels: string[],
): string {
  if (verdict !== 'TIDAK_KONSISTEN') return OCR_VERDICT_LABELS[verdict];
  const fields = mismatchedFieldLabels.length > 0 ? mismatchedFieldLabels.join(', ') : 'data';
  return OCR_VERDICT_LABELS.TIDAK_KONSISTEN.replace('[field yang berbeda]', fields);
}

export const ERROR_REKENING_LOAD_FAILED = 'Gagal memuat rekening tujuan. Muat ulang halaman.';

// copy-id.md §14 — jual-beli fulfillment-confirmation label (Pembeli, C5)
export const CONFIRM_FULFILLMENT_LABEL_JUAL_BELI = 'Konfirmasi barang diterima';

// Functional error messages (same category as ERROR_PHONE_INVALID etc. —
// not legal-adjacent copy, not in copy-id.md by design).
export const ERROR_BUKTI_ATTESTATION_REQUIRED = 'Centang pernyataan bukti sebelum mengunggah.';
export const ERROR_BUKTI_FILE_REQUIRED = 'Pilih file bukti transfer.';
export const ERROR_BUKTI_UPLOAD_FAILED = 'Gagal mengunggah bukti. Coba lagi.';
export const ERROR_BUKTI_SAVE_FAILED = 'Gagal mencatat bukti. Coba lagi.';
export const ERROR_CONFIRM_FAILED = 'Gagal mengonfirmasi. Coba lagi.';
export const ERROR_WRONG_PARTY_PEMBELI_ONLY = 'Hanya pihak pembeli yang dapat melakukan ini.';
export const ERROR_WRONG_PARTY_PENJUAL_ONLY = 'Hanya pihak penjual yang dapat melakukan ini.';

// ============================================================
// copy-id.md §16 — Section C payment lifecycle (locked 2026-07-20). Started
// as DRAFT (2026-07-19 batch); reviewed line-by-line against copy-id.md's
// forbidden-words/fact-not-person rules and data-model.md's breach pipeline
// before locking — see §16 for the one wording fix that came out of that
// review (BARANG_TIDAK_SESUAI_CONSEQUENCES' identity-verification bullet).
// ============================================================

// C4 — Penjual's DIBAYAR_DIKLAIM page
export const CONFIRM_RECEIPT_LABEL = 'Konfirmasi uang diterima';
export const PAYMENT_NOT_RECEIVED_LABEL = 'Dana belum masuk';
export const OCR_AUTHENTICITY_DISCLAIMER =
  'Pemeriksaan konsistensi bukan pemeriksaan keaslian. Buka aplikasi perbankan Anda sendiri sebelum mengonfirmasi.';

// C5 — DIKONFIRMASI_TERIMA, both sides
export const SHIP_INSTRUCTION =
  'Uang telah dikonfirmasi diterima. Kirim barang sesuai kesepakatan.';
export const BARANG_TIDAK_SESUAI_BUTTON = 'Barang tidak sesuai kesepakatan';

// C6 — "barang tidak sesuai" stub (submit always disabled, no RPC call)
export const BARANG_TIDAK_SESUAI_PROMPT =
  'Bagian mana dari keterangan di atas yang tidak dipenuhi?';
export const BARANG_TIDAK_SESUAI_CONSEQUENCES: readonly string[] = [
  'Laporan tercatat sebagai klaim Anda, bukan putusan SAKSI.',
  'Penjual mendapat 14 hari untuk menanggapi.',
  'Laporan Anda dan tanggapan pihak lain (jika ada) sama-sama tercatat permanen di catatan rekening ini.',
  'SAKSI tidak menengahi dan tidak mengembalikan dana.',
  'Nomor HP pelapor terverifikasi. Laporan palsu juga tercatat permanen atas nomor ini.',
];
export const BARANG_TIDAK_SESUAI_GATE_BANNER =
  'Fitur pelaporan memerlukan verifikasi nomor HP (OTP), belum tersedia. Kami akan memberi tahu saat siap.';
export const BARANG_TIDAK_SESUAI_SUBMIT_LABEL = 'Kirim Laporan';

// C7 — SELESAI, minimal placeholder pending a real design pass
export const SELESAI_CLOSING_LINE = 'Kesepakatan selesai. Tercatat di SAKSI.';

// C5/C7 — "riwayat" timeline event labels (deal_events.event -> display text).
// Only the event names actually reachable on the jual-beli happy path built
// so far are covered; an unmapped event falls back to the raw event name.
export const TIMELINE_EVENT_LABELS: Record<string, string> = {
  CREATED: 'Kesepakatan dibuat',
  COUNTERPART_JOINED: 'Pihak lain bergabung',
  PROPOSER_ACCEPTED: 'Pengaju menyetujui',
  COUNTERPART_ACCEPTED: 'Pihak lain menyetujui',
  ACCEPTED: 'Kesepakatan disetujui kedua pihak',
  BUKTI_UPLOADED: 'Bukti transfer diunggah',
  RECEIPT_CONFIRMED: 'Penerimaan dana dikonfirmasi',
  FULFILLMENT_CONFIRMED: 'Barang/pemenuhan dikonfirmasi',
};

// copy-id.md §16 — minimal fill-ins for the non-Section-C-defined side of
// each merged status page (e.g. what Penjual sees while waiting at
// DISEPAKATI, what Pembeli sees while waiting at DIBAYAR_DIKLAIM).
export const WAITING_FOR_PAYMENT_PROOF =
  'Menunggu pihak pembeli mengunggah bukti transfer.';
export const WAITING_FOR_RECEIPT_CONFIRMATION =
  'Menunggu konfirmasi penerimaan dari pihak penjual.';

// copy-id.md §9a — deadline nudge WA template (locked 2026-07-20).
// State-agnostic by design: does not name the specific action (differs by
// DIBAYAR_DIKLAIM vs DIKONFIRMASI_TERIMA) and does not preview day-counts.
// Sender identity matches the OTP template (copy-id.md §9): SAKSI (saksi.app).
export function formatDeadlineNudgeMessage(itemDesc: string, dealUrl: string): string {
  return `Kesepakatan SAKSI Anda ("${itemDesc}") telah melewati batas waktu. Buka ${dealUrl} untuk melihat status dan tindakan yang diperlukan.`;
}

// copy-id.md §9b — turn-taking WA notifications (locked 2026-07-20). Unlike
// formatDeadlineNudgeMessage, each of these is tied to exactly one transition,
// so each names the specific next action instead of staying state-agnostic.
// Sender identity matches §9/§9a: SAKSI (saksi.app).
export function formatCounterpartJoinedMessage(itemDesc: string, dealUrl: string): string {
  return `Kesepakatan SAKSI Anda ("${itemDesc}") sudah dibuka pihak lain. Buka ${dealUrl} untuk menyetujui.`;
}

export function formatPartyAcceptedMessage(itemDesc: string, dealUrl: string): string {
  return `Pihak lain telah menyetujui kesepakatan SAKSI Anda ("${itemDesc}"). Buka ${dealUrl} untuk menyetujui.`;
}

export function formatDisepakatiMessage(itemDesc: string, dealUrl: string): string {
  return `Kesepakatan SAKSI Anda ("${itemDesc}") telah disetujui kedua pihak. Buka ${dealUrl} untuk melakukan pembayaran.`;
}

export function formatBuktiUploadedMessage(itemDesc: string, dealUrl: string): string {
  return `Bukti transfer telah diunggah untuk kesepakatan SAKSI Anda ("${itemDesc}"). Buka ${dealUrl} untuk mengonfirmasi penerimaan dana.`;
}

export function formatReceiptConfirmedMessage(itemDesc: string, dealUrl: string): string {
  return `Penerimaan dana telah dikonfirmasi untuk kesepakatan SAKSI Anda ("${itemDesc}"). Buka ${dealUrl} untuk mengonfirmasi barang diterima.`;
}

// ============================================================
// UI chrome added for the UX-audit fix pass (2026-07-20) — not legally
// adjacent copy, not in copy-id.md by design (same category as
// PENDING_DEFAULT_LABEL / COPY_REKENING_COPIED_LABEL above), but centralized
// here per Law 3 discipline.
// ============================================================

// Persistent deal-link card (shown on every non-terminal deal status, not
// just DRAF — the audit's "lost link = lost deal" finding, since identity is
// phone-only with no session).
export const DEAL_LINK_CARD_HEADING = 'Link kesepakatan ini';
export const DEAL_LINK_SAVE_HINT =
  'Simpan link ini. Tanpa link, kesepakatan tidak dapat dibuka kembali.';
export const SHARE_TO_WHATSAPP_LABEL = 'Bagikan ke WhatsApp';

// Progress stepper (6 nodes: Dibuat -> Bergabung -> Disepakati -> Dibayar ->
// Diterima -> Selesai), shown on every deal-page status.
export const PROGRESS_STEP_LABELS: readonly string[] = [
  'Dibuat',
  'Bergabung',
  'Disepakati',
  'Dibayar',
  'Diterima',
  'Selesai',
];
