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

// copy-id.md §15 — item title + optional detail (supersedes the old single
// free-text description field, 2026-07-20 UX-audit pass). Role-keyed
// placeholders removed along with it: only PENJUAL/PEMBELI ever reached this
// form (deal-type gating), so a flat pair of strings replaces the dormant
// per-role dict rather than keeping four unreachable entries around.
export const ITEM_TITLE_LABEL = 'Barang/jasa apa?';
export const ITEM_TITLE_PLACEHOLDER = 'Contoh: iPhone 13 128GB hitam';
export const ITEM_DETAIL_LABEL = 'Detail tambahan (opsional)';
export const ITEM_DETAIL_PLACEHOLDER =
  'Contoh: Kondisi baru, termasuk box dan charger, dikirim setelah lunas.';

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
  'Tingkatan menunjukkan verifikasi identitas, bukan keamanan kesepakatan. Laporan selalu gratis di semua tingkatan.';

// copy-id.md §6 — paid-tier disabled cards' notify-me checkbox label
export const NOTIFY_ME_LABEL = 'Beri tahu saat tersedia.';

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

// ============================================================
// B5 — public /cek page (build step 4, final phase). data-model.md's
// "Profile page" section is the locked source for the full 8-bucket set
// and its Indonesian names ("selesai · dibatalkan bersama · tidak
// dilanjutkan (HnR) · kedaluwarsa · dikembalikan penuh · dikembalikan
// sebagian · tidak dipenuhi · klaim berbeda aktif") — this extends
// formatAccountHistory's exact "[N] [label]" · -separated style
// (copy-id.md §2) to all eight rather than just the two that line covers,
// since §2's own line is deliberately the minimal per-deal forced-check
// card, not this page's full profile summary. Bucket order matches
// data-model.md's list order.
// ============================================================

export function formatAccountHistoryFull(
  identifierLabel: string, // e.g. "BCA 12••••34" or a phone-hash-based label
  counts: {
    selesaiCount: number;
    dibatalkanBersamaCount: number;
    tidakDilanjutkanCount: number;
    kedaluwarsaCount: number;
    dikembalikanPenuhCount: number;
    dikembalikanSebagianCount: number;
    tidakDipenuhiCount: number;
    klaimBerbedaAktifCount: number;
  },
  sinceLabel: string,
): string {
  const parts = [
    `${counts.selesaiCount} selesai`,
    `${counts.dibatalkanBersamaCount} dibatalkan bersama`,
    `${counts.tidakDilanjutkanCount} tidak dilanjutkan`,
    `${counts.kedaluwarsaCount} kedaluwarsa`,
    `${counts.dikembalikanPenuhCount} dikembalikan penuh`,
    `${counts.dikembalikanSebagianCount} dikembalikan sebagian`,
    `${counts.tidakDipenuhiCount} tidak dipenuhi`,
    `${counts.klaimBerbedaAktifCount} klaim berbeda aktif`,
  ];
  return `${identifierLabel} · ${parts.join(' · ')} · tercatat sejak ${sinceLabel}`;
}

// copy-id.md §18 (DRAFT, pending review) — the lookup form itself has no
// locked source text of its own (data-model.md specifies the profile page's
// DATA, not this form's UI copy); backfilled into §18 per the Tier B
// copy-lock discipline.
export const CEK_PAGE_HEADING = 'Cek rekening atau nomor HP';
export const CEK_REKENING_TAB_LABEL = 'Rekening';
export const CEK_PHONE_TAB_LABEL = 'Nomor HP';
// Deliberately not PHONE_FIELD_LABEL ("Nomor HP Anda") — that wording
// assumes the visitor is entering their own number (true when joining a
// deal, not necessarily true here, where the number being checked could be
// anyone's). PHONE_FORMAT_HINT has no such assumption baked in and is
// reused as-is.
export const CEK_PHONE_FIELD_LABEL = 'Nomor HP';
export const CEK_BANK_FIELD_LABEL = 'Bank';
export const CEK_REKENING_FIELD_LABEL = 'Nomor rekening';
export const CEK_SUBMIT_LABEL = 'Cek riwayat';
export const CEK_RATE_LIMIT_MESSAGE = 'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.';
export const CEK_INVALID_INPUT_MESSAGE = 'Masukkan bank dan nomor rekening, atau nomor HP yang valid.';

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

// copy-id.md §12's accept step (DIAJUKAN -> DISEPAKATI) — ACCEPT_BUTTON_LABEL,
// STATUS_ALREADY_ACCEPTED, ERROR_ACCEPT_FAILED — retired 2026-07-20: folded
// into joinDeal (migration 0025), no separate accept action exists anymore.
// Not reused for anything else; noted here rather than silently dropped,
// same treatment BARANG_TIDAK_SESUAI_GATE_BANNER's retirement got.

export const ERROR_PHONE_NOT_IN_DEAL =
  'Nomor ini tidak terdaftar pada kesepakatan ini.';

export const STATUS_DISEPAKATI_PLACEHOLDER =
  'Kesepakatan telah disetujui kedua pihak.';

// Originally scoped to the accept-screen phone-guess rate limit; since
// widened (checkIdentifyRateLimit) into the shared limiter every
// identifyPartyByPhone call site in paymentActions.ts/breachActions.ts uses
// — comment corrected 2026-07-20, string itself unchanged and still live.
export const ERROR_TOO_MANY_ATTEMPTS = 'Terlalu banyak percobaan. Coba lagi nanti.';

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

// Cross-file duplicated "riwayat" (history) card heading — found by
// monster_check: 'Riwayat' was independently typed in DikonfirmasiTerimaPanel
// (x2), SelesaiPanel, and TidakDipenuhiPanel (x2), same Law 3 category as
// PENDING_DEFAULT_LABEL above.
export const RIWAYAT_HEADING = 'Riwayat';

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
export const ERROR_BUKTI_LOAD_FAILED = 'Gagal memuat bukti. Muat ulang halaman.';
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
// Not in copy-id.md (added with the WA-nudge wiring) — must not say
// "dicatat"/"tercatat" here: unlike the rest of C4, this tap writes nothing
// to deal_events. Only a best-effort notification goes out.
export const PAYMENT_NOT_RECEIVED_ACK =
  'Notifikasi terkirim ke pembeli. Kesepakatan tetap berjalan; periksa kembali secara berkala.';
// Bug found by monster_check: PAYMENT_NOT_RECEIVED_ACK above was previously
// shown unconditionally, even when the WA send failed. This is the honest
// counterpart for that case.
export const ERROR_NOTIFY_SEND_FAILED = 'Gagal mengirim notifikasi. Coba lagi.';
export const OCR_AUTHENTICITY_DISCLAIMER =
  'Pemeriksaan konsistensi bukan pemeriksaan keaslian. Buka aplikasi perbankan Anda sendiri sebelum mengonfirmasi.';

// C5 — DIKONFIRMASI_TERIMA, both sides
export const SHIP_INSTRUCTION =
  'Uang telah dikonfirmasi diterima. Kirim barang sesuai kesepakatan.';
export const BARANG_TIDAK_SESUAI_BUTTON = 'Barang tidak sesuai kesepakatan';

// C6 — "barang tidak sesuai" report filing (copy-id.md §16, locked)
export const BARANG_TIDAK_SESUAI_PROMPT =
  'Bagian mana dari keterangan di atas yang tidak dipenuhi?';
export const BARANG_TIDAK_SESUAI_CONSEQUENCES: readonly string[] = [
  'Laporan tercatat sebagai klaim Anda, bukan putusan SAKSI.',
  'Penjual mendapat 14 hari untuk menanggapi.',
  'Laporan Anda dan tanggapan pihak lain (jika ada) sama-sama tercatat permanen di catatan rekening ini.',
  'SAKSI tidak menengahi dan tidak mengembalikan dana.',
  'Nomor HP pelapor terverifikasi. Laporan palsu juga tercatat permanen atas nomor ini.',
];
// BARANG_TIDAK_SESUAI_GATE_BANNER retired (build step 4, 2026-07-20): it
// announced the OTP gate as "belum tersedia" — no longer true now that the
// OTP-gated filing below is wired up. Same treatment §6a gave the retired
// jenis-transaksi selector: noted here rather than silently dropped. If a
// future stub needs a similar "coming soon" banner, write a new one instead
// of reviving this text, since it's specific to this now-shipped gate.
export const BARANG_TIDAK_SESUAI_SUBMIT_LABEL = 'Kirim Laporan';
// Was inline JSX in BarangTidakSesuaiModal.tsx (pre-existing, predates this
// audit pass) — moved here for consistency with every other string in that
// modal, and reused verbatim as DeadlineLapseReportModal's heading source.
export const BARANG_TIDAK_SESUAI_MODAL_HEADING = 'Barang Tidak Sesuai Kesepakatan';
export const DEADLINE_LAPSE_MODAL_HEADING = 'Laporkan Kesepakatan Tidak Dipenuhi';
// Shared close-button label across both report modals — was inline JSX in
// both, same reasoning as the two headings above.
export const MODAL_CLOSE_LABEL = 'Tutup';

// copy-id.md §17 (DRAFT, pending review) — build step 4's OTP step, backfilled
// per the Tier B copy-lock discipline.
export const OTP_STEP_HEADING = 'Verifikasi nomor HP Anda untuk melanjutkan laporan.';
export const OTP_SEND_BUTTON_LABEL = 'Kirim kode verifikasi';
export const OTP_RESEND_BUTTON_LABEL = 'Kirim ulang kode';
export const OTP_CODE_FIELD_LABEL = 'Kode verifikasi';
export const OTP_CODE_FORMAT_HINT = '6 digit, berlaku 5 menit';
export const OTP_VERIFY_BUTTON_LABEL = 'Verifikasi';
export const ERROR_OTP_SEND_FAILED = 'Gagal mengirim kode. Coba lagi.';
export const ERROR_OTP_SEND_RATE_LIMITED = 'Terlalu banyak permintaan kode. Coba lagi dalam satu jam.';
export const ERROR_OTP_INVALID = 'Kode salah atau sudah kedaluwarsa.';
export const ERROR_OTP_TOO_MANY_ATTEMPTS = 'Terlalu banyak percobaan. Minta kode baru.';
export const ERROR_REPORT_FILE_FAILED = 'Gagal mencatat laporan. Coba lagi.';

// Second breach-report entry point (build step 4 follow-on) — the
// DIBAYAR_DIKLAIM "ghost seller" case: Pembeli already uploaded bukti, the
// deadline has passed, Penjual never confirmed receipt. Same underlying
// mechanism, consequences, and 14-day hak-jawab window as C6's barang-tidak-
// sesuai path; only the entry framing differs (no goods-mismatch claim to
// describe, so the note is optional here). BARANG_TIDAK_SESUAI_CONSEQUENCES
// and BARANG_TIDAK_SESUAI_SUBMIT_LABEL below are reused verbatim for this
// path too — their content was already state-agnostic despite the name.
// copy-id.md §17 (DRAFT, pending review), same backfill as OTP_STEP_HEADING etc.
export const DEADLINE_LAPSE_REPORT_BUTTON = 'Kesepakatan tidak dipenuhi setelah batas waktu';
export const DEADLINE_LAPSE_PROMPT = 'Catatan tambahan tentang kesepakatan ini (opsional):';
export const ERROR_DEADLINE_NOT_PASSED = 'Batas waktu kesepakatan ini belum terlewati.';

// copy-id.md §17 (DRAFT, pending review) — TIDAK_DIPENUHI/SENGKETA screens
// (build step 4 follow-on), same backfill as immediately above. Generalized
// (2026-07-20, deadline-lapse entry point added) to neutral wording: this
// screen renders for TIDAK_DIPENUHI regardless of which of the two report
// paths put the deal there, so it can no longer assume a goods-mismatch
// claim specifically.
export const TIDAK_DIPENUHI_REPORTER_WAITING =
  'Laporan Anda tercatat. Menunggu tanggapan pihak penjual (14 hari sejak laporan diajukan).';
export const TIDAK_DIPENUHI_FLAGGED_HEADING =
  'Laporan diterima: kesepakatan dianggap tidak dipenuhi.';
export const TIDAK_DIPENUHI_FIELD_NOTE_LABEL = 'Catatan pelapor:';
export const HAK_JAWAB_NOTE_LABEL = 'Catatan tanggapan Anda (opsional)';
// Build step 4 follow-on (migration 0022) — the evidence-attachment field,
// same §17 DRAFT backfill as HAK_JAWAB_NOTE_LABEL above. The hint's "seluruh
// rentang tanggal" wording is a design decision carried from planning: it
// makes selective cropping more visible without claiming SAKSI can verify
// anything about the attachment.
export const HAK_JAWAB_EVIDENCE_LABEL = 'Lampirkan bukti pendukung (opsional)';
export const HAK_JAWAB_EVIDENCE_HINT =
  'Jika mengunggah mutasi rekening, sertakan seluruh rentang tanggal yang diklaim, bukan potongan sebagian.';
export const HAK_JAWAB_EVIDENCE_LINK_LABEL = 'Lihat bukti pendukung';
export const HAK_JAWAB_SUBMIT_LABEL = 'Kirim Tanggapan';
export const ERROR_HAK_JAWAB_WINDOW_CLOSED = 'Jendela 14 hari untuk menanggapi telah berakhir.';
export const ERROR_HAK_JAWAB_FAILED = 'Gagal mencatat tanggapan. Coba lagi.';
export const SENGKETA_STATUS_LINE = 'Status: klaim berbeda.';

// ============================================================
// copy-id.md §1 — the flag ladder (build step 4, migration 0023: publication).
// First programmatic use of this section; every string below is a verbatim
// transcription, not a paraphrase. Composed by lib/flags/render.ts rather
// than by runtime string search-and-replace on the tier templates: each
// tier body is split into a fixed STEM (everything up to but not including
// the trailing sentence) plus one of two TAILs, concatenated at render
// time. This reproduces the exact locked strings byte-for-byte for the
// unresponded case (STEM + TAIL_SILENT) while keeping the DISPUTED
// replacement (STEM + TAIL_DISPUTED) impossible to get subtly wrong via a
// find/replace on text that might not match if the stem ever changes.
// ============================================================

export const FLAG_RUNG_LINES: Record<0 | 1 | 2, string> = {
  0: 'Bukti transfer diklaim pelapor. Belum dikonfirmasi pihak terlapor, belum diverifikasi bank.',
  1: 'Pembayaran dikonfirmasi kedua pihak. Belum diverifikasi bank.',
  // Roadmap only (open-banking verified) — do not ship a code path that can
  // actually select this until that integration exists (copy-id.md §1).
  2: 'Pembayaran terverifikasi melalui mutasi bank.',
};

// [tgl] is filled in by the caller (lib/flags/render.ts) via formatDate on
// the originating TENGGAT_LEWAT event's created_at — the date the deal was
// recorded as unfulfilled, matching every other §7 exit-state line's [tgl].
const FLAG_BODY_STEM: Record<'GRATIS' | 'LIMA_RIBU' | 'BERMETERAI', (tgl: string) => string> = {
  GRATIS: (tgl) => `1 kesepakatan tercatat tidak dipenuhi (${tgl}). Identitas para pihak tidak diverifikasi.`,
  LIMA_RIBU: (tgl) => `1 kesepakatan tercatat tidak dipenuhi (${tgl}). Nomor HP kedua pihak terverifikasi.`,
  BERMETERAI: (tgl) =>
    `1 kesepakatan bermeterai tidak dipenuhi (${tgl}). Identitas terverifikasi (e-KYC). Dokumen siap diajukan sebagai bukti.`,
};

export function formatFlagBodyStem(tier: 'GRATIS' | 'LIMA_RIBU' | 'BERMETERAI', tgl: string): string {
  return FLAG_BODY_STEM[tier](tgl);
}

export const FLAG_TAIL_SILENT = 'Terlapor tidak merespons dalam 14 hari.';
// Replaces FLAG_TAIL_SILENT when hak jawab was filed — permanent once a
// response exists (2026-07-20 decision: resolved a conflict where
// data-model.md's prose read as a second silence window that could
// eventually re-publish FLAG_TAIL_SILENT despite a real response on
// record — rejected as a false statement on a public record).
export const FLAG_TAIL_DISPUTED = 'Terlapor memberikan tanggapan. Status: klaim berbeda.';
export const FLAG_EVIDENCE_SUB_LINE = 'Terlapor menyertakan bukti pada tanggapannya.';

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
  // Build step 4 additions — now in copy-id.md §16's timeline table, same
  // fallback-to-raw-name contract as every other unmapped event. Generalized
  // (deadline-lapse entry point added) since TENGGAT_LEWAT now fires from two
  // different report paths, not just barang-tidak-sesuai.
  TENGGAT_LEWAT: 'Laporan diajukan: kesepakatan tidak dipenuhi',
  HAK_JAWAB_FILED: 'Tanggapan pihak terlapor diajukan',
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
//
// formatCounterpartJoinedMessage/formatPartyAcceptedMessage retired
// 2026-07-20: both described a "come accept" step that no longer exists
// (joinDeal fires ACCEPTED automatically — see migration 0025). Firing
// either today would be an actively false message, not just an unused one,
// so they're removed rather than left dormant. formatDisepakatiMessage below
// now fires directly from joinDeal instead of only after a manual accept.
export function formatDisepakatiMessage(itemDesc: string, dealUrl: string): string {
  return `Kesepakatan SAKSI Anda ("${itemDesc}") telah disetujui kedua pihak. Buka ${dealUrl} untuk melakukan pembayaran.`;
}

export function formatBuktiUploadedMessage(itemDesc: string, dealUrl: string): string {
  return `Bukti transfer telah diunggah untuk kesepakatan SAKSI Anda ("${itemDesc}"). Buka ${dealUrl} untuk mengonfirmasi penerimaan dana.`;
}

export function formatReceiptConfirmedMessage(itemDesc: string, dealUrl: string): string {
  return `Penerimaan dana telah dikonfirmasi untuk kesepakatan SAKSI Anda ("${itemDesc}"). Buka ${dealUrl} untuk mengonfirmasi barang diterima.`;
}

// Not in copy-id.md §9b (added later, same house style) — fired by the
// Penjual's "Dana belum masuk" tap on C4. Deliberately NOT a claim: no
// deal_events row, no state change, same as every string above it. This is
// the only consequence of that tap — a nudge to the payer to double-check
// their own transfer, addressed to a plausible bank-delay explanation, not
// an accusation.
export function formatPaymentNotReceivedMessage(itemDesc: string, dealUrl: string): string {
  return `Penjual belum menerima dana untuk kesepakatan SAKSI Anda ("${itemDesc}"). Periksa kembali transfer Anda. Buka ${dealUrl} untuk melihat status.`;
}

// copy-id.md §9 — OTP message, locked. First real call site: breach-report
// filing (build step 4). Sender identity: SAKSI (saksi.app), same as every
// WA message above.
export function formatOtpMessage(code: string): string {
  return `Kode verifikasi SAKSI Anda: ${code}. Berlaku 5 menit. Jangan bagikan kepada siapa pun, termasuk pihak yang mengaku dari SAKSI.`;
}

// copy-id.md §9c (DRAFT, pending review) — build step 4 (breach path)
// turn-taking notifications, same house style as §9b. Fired by fileBarangTidakSesuaiReport and
// fileDeadlineLapseReport (both, to the flagged party) and respondHakJawab
// (to the reporter). Renamed from formatBarangTidakSesuaiFiledMessage
// (deadline-lapse entry point added) — the text was already generic (names
// no specific claim), only the old name implied it was C6-specific.
export function formatBreachReportFiledMessage(itemDesc: string, dealUrl: string): string {
  return `Laporan diajukan untuk kesepakatan SAKSI Anda ("${itemDesc}"). Anda memiliki 14 hari untuk menanggapi. Buka ${dealUrl} untuk melihat detail.`;
}

export function formatHakJawabFiledMessage(itemDesc: string, dealUrl: string): string {
  return `Pihak penjual telah menanggapi laporan pada kesepakatan SAKSI Anda ("${itemDesc}"). Buka ${dealUrl} untuk melihat tanggapannya.`;
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

// ============================================================
// Full transaction ledger + reputation-gaming signals (build step 5) — not
// in copy-id.md, pending review (same discipline as every other new
// user-facing string: drafted here, flagged, needs a locking pass before
// treated as final). Design confirmed in data-model.md's section of the
// same name (2026-07-20) — these are that design's exact drafted strings,
// not invented at implementation time.
// ============================================================

// ROADMAP.md's own note: this link text is a suggestion, not legal-adjacent
// locked copy, same category as other low-stakes UI chrome approved inline.
export const LEDGER_DETAIL_LINK_LABEL = 'Lihat detail lengkap';
export const LEDGER_EMPTY_STATE = 'Belum ada riwayat lengkap untuk ditampilkan.';
export const ERROR_LEDGER_UNAVAILABLE = 'Riwayat lengkap tidak dapat dimuat saat ini. Coba lagi.';

// Per-row bucket labels — same words formatAccountHistoryFull already uses
// for the aggregate line, kept identical rather than reworded per-row.
export const LEDGER_BUCKET_LABELS: Record<
  'SELESAI' | 'DIBATALKAN_BERSAMA' | 'TIDAK_DILANJUTKAN' | 'KEDALUWARSA' | 'DIKEMBALIKAN_PENUH' | 'DIKEMBALIKAN_SEBAGIAN' | 'TIDAK_DIPENUHI' | 'KLAIM_BERBEDA_AKTIF',
  string
> = {
  SELESAI: 'selesai',
  DIBATALKAN_BERSAMA: 'dibatalkan bersama',
  TIDAK_DILANJUTKAN: 'tidak dilanjutkan',
  KEDALUWARSA: 'kedaluwarsa',
  DIKEMBALIKAN_PENUH: 'dikembalikan penuh',
  DIKEMBALIKAN_SEBAGIAN: 'dikembalikan sebagian',
  TIDAK_DIPENUHI: 'tidak dipenuhi',
  KLAIM_BERBEDA_AKTIF: 'klaim berbeda aktif',
};

// Signal 5 — pair-completion rate limit block (confirmFulfillment).
// Deliberately states the limit is systemic, not an accusation about this
// specific pair, and that the deal record itself is untouched — only the
// confirmation action is paused. Recourse channel: sapa@saksi.app is the
// only support contact anywhere in this product (see the two legal docs'
// footers) — reused here rather than inventing a new one, and stated
// honestly as manual (no admin override tooling exists in this app yet).
export const ERROR_PAIR_COMPLETION_LIMIT =
  'Konfirmasi ditunda sementara: terlalu banyak kesepakatan selesai dengan pihak yang sama dalam waktu singkat. Ini batas otomatis untuk semua pengguna, bukan penilaian atas kesepakatan Anda. Kesepakatan ini tetap tercatat apa adanya. Butuh bantuan lebih cepat? Hubungi sapa@saksi.app.';

// counterpartHashFragment: a short prefix of the other party's phone_hash
// (see lib/format.ts's shortHashFragment), not a masked phone number —
// phone_hash is a SHA-256 hex string with no human-readable structure to
// partially redact the way a real phone/rekening is masked. A short,
// consistent fragment lets a viewer spot "same person across rows" without
// printing the full 64-char hash as noise.
export function formatLedgerRow(
  bucket: keyof typeof LEDGER_BUCKET_LABELS,
  dateLabel: string,
  itemDesc: string,
  amountLabel: string,
  counterpartHashFragment: string | null,
): string {
  const base = `${itemDesc} · ${amountLabel} · ${LEDGER_BUCKET_LABELS[bucket]} · ${dateLabel}`;
  return counterpartHashFragment ? `${base} · pihak ${counterpartHashFragment}` : base;
}
