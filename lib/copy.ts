// Canonical source for all user-facing Indonesian copy.
// Strings are verbatim from .claude/skills/saksi-builder/references/copy-id.md.
// No em dashes. Do not paraphrase.

export const ATTESTATIONS: readonly string[] = [
  'Saya berusia 18 tahun ke atas.',
  'Nomor HP dan rekening yang saya masukkan milik saya sendiri.',
  'Saya setuju data saya diproses untuk pencatatan dan pencocokan riwayat kesepakatan.',
  'Saya paham SAKSI hanya mencatat, tidak menahan dana atau menjamin pihak lain.',
];

// copy-id.md §48 — new UI chrome, not legally adjacent (same category as
// §23's INVOICE_* labels): a one-tap shortcut over the 4 individually
// required checkboxes above. Ticking it flips every item at once, but each
// remains its own real checkbox state afterward (still individually
// uncheckable) — this does not bundle the 4 statements into one consent
// event, it only saves taps for a reader who has read all 4.
export const ATTEST_CHECK_ALL_LABEL = 'Centang semua pernyataan';
export const ATTEST_UNCHECK_ALL_LABEL = 'Batalkan semua';

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

// §43 (2026-07-21, reconciled 2026-08-01) — the legacy tier-card copy is
// REMOVED (six exports: TIER_LABELS, TIER_GRATIS_DESC, TIER_LIMA_RIBU_DESC,
// TIER_BERMETERAI_DESC, TIER_FOOTER, NOTIFY_ME_LABEL). Every one had zero
// import sites — dead exports — and every one described the original
// verification ladder that no longer exists.
//
// The old per-deal verification ladder (GRATIS / LIMA_RIBU Rp5.000 /
// BERMETERAI Rp50.000) has been fully removed from the schema (migration
// 0039), FLAG_BODY_STEM, and tier labels. The new product model is
// seller-account tiers:
//   - Akun Saksi (Rp20.000 one-time) — phone login, saved rekening, badge
//   - Toko Saksi Pro (Rp200.000/year) — logo on invoice + storefront
//   - Saksi Resmi (Rp30.000/perjanjian, future) — buyer-initiated e-meterai
//
// The new tiers sell seller convenience and display, NOT counterparty
// verification. The human-facing tier story is the greyed, inert
// TOKO_PRO_LOCKED_* card (§32) on the riwayat page. Akun Saksi is
// deliberately NOT surfaced anywhere — it is the price of an account, and
// accounts do not exist yet.
//
// FLAG_BODY_STEM is now tier-agnostic (one template — identity is not
// verified for any deal today). When seller account tiers are built,
// redesigning the flag's identity ladder (what, if anything, does a paid
// seller tier surface on a published flag?) belongs with that build.


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

// §45 (2026-07-21) — account-history line (with history), reworked around the
// realistic lifecycle + fair attribution (see accountHistory.ts). This is the
// SELLER's payout rekening, so it shows only what reflects on the SELLER's
// conduct: how many times money was confirmed received ("transaksi berhasil"),
// how many times a buyer disputed the goods ("klaim barang berbeda"), and how
// many times the seller took payment but never confirmed it ("belum
// dikonfirmasi penjual" — the naughty-seller signal that used to be invisible).
// A payment dispute is deliberately NOT here: it questions the buyer's payment,
// not the seller's honesty, and staining an honest seller with it would break
// the one invariant.
export function formatAccountHistory(
  bank: string,
  rekeningMasked: string,
  berhasilCount: number,
  klaimBarangCount: number,
  belumDikonfirmasiCount: number,
  pernahKlaimBelumTerimaCount: number,
  sinceLabel: string,
): string {
  return `Rekening tujuan: ${bank} ${rekeningMasked} · ${formatAccountHistoryCounts(berhasilCount, klaimBarangCount, belumDikonfirmasiCount, pernahKlaimBelumTerimaCount, sinceLabel)}`;
}

// §26 (2026-07-21), reworked §45 — the counts half of formatAccountHistory,
// for surfaces that already render the bank + masked number as their own
// heading and would otherwise print it twice. Same facts, same words, same
// order as the tail of the line above.
export function formatAccountHistoryCounts(
  berhasilCount: number,
  klaimBarangCount: number,
  belumDikonfirmasiCount: number,
  pernahKlaimBelumTerimaCount: number,
  sinceLabel: string,
): string {
  return `${berhasilCount} transaksi berhasil · ${klaimBarangCount} klaim barang berbeda · ${belumDikonfirmasiCount} belum dikonfirmasi penjual · ${pernahKlaimBelumTerimaCount} klaim pembayaran belum diterima · tercatat sejak ${sinceLabel}`;
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

// §45 (2026-07-21) — reworked to the four fair-attribution buckets. Unlike the
// rekening card (seller-only), /cek looks up a PHONE, which can be the seller
// in one deal and the buyer in another, so it also shows "klaim pembayaran
// berbeda" — the payment-dispute bucket that, on a phone, is a true signal
// about the number's own conduct as a payer. Each bucket is individually true
// of the number regardless of which side it stood on.
export function formatAccountHistoryFull(
  identifierLabel: string, // e.g. "BCA 12••••34" or a phone-hash-based label
  counts: {
    berhasilCount: number;
    klaimBarangCount: number;
    belumDikonfirmasiCount: number;
    klaimPembayaranCount: number;
    pernahKlaimBelumTerimaCount: number;
  },
  sinceLabel: string,
): string {
  const parts = [
    `${counts.berhasilCount} transaksi berhasil`,
    `${counts.klaimBarangCount} klaim barang berbeda`,
    `${counts.belumDikonfirmasiCount} belum dikonfirmasi penjual`,
    `${counts.klaimPembayaranCount} klaim pembayaran berbeda`,
    `${counts.pernahKlaimBelumTerimaCount} klaim pembayaran belum diterima`,
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

// copy-id.md §22 — deal join flow (supersedes §12's heading/instruction).
// app/buat/actions.ts now only accepts PENJUAL as a proposer_role (closed
// 2026-07-21) — the counterpart joining here is therefore always the payer,
// as an enforced fact, not a UI assumption. One label, no role-neutral
// hedging needed.
export const JOIN_FORM_HEADING = 'Masukkan nomor HP kamu untuk melihat rekening pembayaran.';

export const JOIN_DEAL_INSTRUCTION =
  'Nomor HP kamu akan tercatat sebagai pihak pembeli. Centang pernyataan di bawah untuk melanjutkan.';

export const JOIN_SUBMIT_LABEL = 'Lihat Rekening & Bayar';

export const STATUS_DIAJUKAN =
  'Kedua pihak tercatat. Menunggu persetujuan kedua pihak.';

export const ERROR_SELF_JOIN =
  'Nomor HP ini sudah digunakan untuk membuat kesepakatan ini. Masukkan nomor HP pihak lain.';

// Not in copy-id.md — repeated across joinDeal/acceptDeal in the same file;
// centralized to avoid the wording drifting between call sites.
export const ERROR_DEAL_NOT_FOUND = 'Kesepakatan tidak ditemukan.';
export const ERROR_DEAL_CLOSED = 'Kesepakatan ini sudah tidak dapat dimasuki.';

// Flag retraction (migration 0035)
export const ERROR_FLAG_NOT_PUBLISHED = 'Laporan belum dipublikasikan atau sudah ditarik.';
export const ERROR_FLAG_RETRACT_FAILED = 'Gagal menarik laporan. Silakan coba lagi.';
export const FLAG_RETRACTION_REASON_LABEL = 'Alasan penarikan (opsional)';
export const FLAG_RETRACT_SUBMIT_LABEL = 'Tarik laporan';
export const FLAG_RETRACTED_LINE = 'Laporan ini telah ditarik kembali oleh pelapor.';
export const FLAG_RETRACTED_PREFIX = 'Ditarik';

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

// Cross-file duplicated UI chrome (app/buat/page.tsx + JoinAndPayForm.tsx) —
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

// RINGKASAN_KESEPAKATAN_HEADING retired (§23, 2026-07-21, found by monster
// check): the deal summary card it labelled was replaced by InvoiceCard.tsx,
// which has no equivalent section heading. Confirmed zero remaining call
// sites (page.tsx was the last one) before removal — its own comment's claim
// of three call sites was already stale at HEAD; DisepakatiPanel.tsx/
// buat/page.tsx never actually used it.

// Cross-file duplicated "Rekening tujuan" field label — found by monster
// check (2026-07-21): independently typed in InvoiceCard.tsx and
// DisepakatiPanel.tsx (same destination-account label, same purpose), and in
// DibayarDiklaimPanel.tsx's OCR field-match row (same string, adjacent
// purpose — naming which field is being compared). Same Law 3 category as
// RIWAYAT_HEADING above.
export const REKENING_TUJUAN_LABEL = 'Rekening tujuan';

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
// Widened 2026-07-21 (copy-id.md §23): was 'Dana belum masuk'. The action has
// always covered two distinct situations — the money genuinely has not landed,
// and the uploaded bukti does not match this deal — and the old label named
// only the first, so a penjual looking at a wrong/mismatched bukti had no
// obvious control. Still not an accusation. (It DOES write a deal_events row
// as of §24/migration 0029 — see DANA_BELUM_MASUK_* below; the earlier
// "writes nothing" note here is no longer true and was removed with it.)
export const PAYMENT_NOT_RECEIVED_LABEL = 'Dana belum masuk / bukti salah';

// §24 (2026-07-21, migration 0029) — this action now records the penjual's
// own account of what happened instead of firing a WA nudge. The three
// strings it used to need (PAYMENT_NOT_RECEIVED_ACK,
// ERROR_NOTIFY_SEND_FAILED, PAYMENT_NOT_RECEIVED_UNDELIVERED) are retired:
// all three described the delivery state of a WhatsApp message, which is no
// longer what this action does and was never a fact about the deal.
export const DANA_BELUM_MASUK_HEADING = 'Apa yang terjadi?';
export const DANA_BELUM_MASUK_PROMPT =
  'Ceritakan yang kamu terima sebenarnya. Contoh: dana belum masuk sama sekali, nominalnya beda, atau bukti yang dikirim bukan untuk transaksi ini.';
export const DANA_BELUM_MASUK_PLACEHOLDER =
  'Contoh: Sampai sekarang belum ada dana masuk ke rekening saya. Saya sudah cek mutasi hari ini.';
export const DANA_BELUM_MASUK_SUBMIT_LABEL = 'Catat keterangan saya';
// States exactly what happens, and just as importantly what does not: this
// records a disagreement, it does not resolve one and does not move the deal.
export const DANA_BELUM_MASUK_CONSEQUENCES: readonly string[] = [
  'Keterangan ini tercatat sebagai pernyataan Anda, bukan putusan SAKSI.',
  'Pembeli dapat melihat keterangan ini di halaman transaksi.',
  'Kesepakatan tetap berjalan. Status dan batas waktu tidak berubah.',
  'SAKSI tidak menengahi dan tidak memindahkan dana.',
];
export const DANA_BELUM_MASUK_RECORDED = 'Keterangan Anda tercatat.';
export const STATEMENT_FROM_PENJUAL_LABEL = 'Keterangan dari penjual';
export const STATEMENT_FROM_PEMBELI_LABEL = 'Keterangan dari pembeli';

// §45 — optional supporting image on a dispute statement. The field label is
// offered as optional ("kalau ada"), and the shown image is described
// neutrally: it is what the party attached, never asserted to be genuine.
export const STATEMENT_IMAGE_FIELD_LABEL = 'Lampirkan foto/tangkapan layar (kalau ada)';
export const STATEMENT_IMAGE_ATTACHED_LABEL = 'Gambar yang dilampirkan';
// Required only when an image is attached — same genuineness attestation as
// bukti (T&C §6.1). A dispute is where forgery risk is highest, so an attached
// image carries the same "saya tidak memalsukan" liability as a payment bukti.
export const STATEMENT_IMAGE_ATTESTATION =
  'Gambar yang saya lampirkan asli dan belum diubah. Mengunggah bukti palsu adalah tanggung jawab hukum saya.';
export const ERROR_STATEMENT_IMAGE_ATTEST_REQUIRED =
  'Centang pernyataan keaslian untuk melampirkan gambar.';

export const ERROR_STATEMENT_TOO_SHORT = 'Tulis keterangan minimal 10 karakter.';
export const ERROR_STATEMENT_TOO_LONG = 'Maksimal 600 karakter.';
export const ERROR_STATEMENT_SAVE_FAILED = 'Gagal mencatat keterangan. Coba lagi.';

// §30 (2026-07-21) — the bounded payment-dispute loop. Two rounds of
// "dana belum masuk" -> corrected bukti, then both actions close. The copy
// states what happens next without predicting an outcome or assigning fault:
// the deal keeps running, both accounts stay on the record, and the existing
// deadline/report path is what settles it if they still disagree.
export const ERROR_DISPUTE_ROUNDS_EXHAUSTED =
  'Batas dua kali klarifikasi sudah tercapai untuk kesepakatan ini.';
export const DISPUTE_ROUNDS_EXHAUSTED_NOTE =
  'Kedua keterangan sudah tercatat dan tidak bisa ditambah lagi. Kesepakatan tetap berjalan sampai batas waktu. Setelah batas waktu lewat, pihak yang dirugikan dapat mengajukan laporan.';
export function formatDisputeRoundsLeft(roundsLeft: number): string {
  return `Sisa ${roundsLeft} kali klarifikasi.`;
}

// Payer's side of the loop — answering a "dana belum masuk" with a corrected
// bukti. Never phrased as an accusation in either direction: the seller may
// be right (the money genuinely is not there) or the buyer may be (the wrong
// file got attached). The copy assumes neither.
export const RESUBMIT_BUKTI_HEADING = 'Penjual belum menerima dana';
export const RESUBMIT_BUKTI_PROMPT =
  'Kalau bukti yang kamu kirim kurang tepat, atau kamu sudah transfer ulang, unggah bukti yang benar di sini.';
export const RESUBMIT_BUKTI_SUBMIT_LABEL = 'Kirim ulang bukti transfer';

// §42 — the goods clarification loop, mirroring the payment one. Neither
// string assigns fault: the buyer may be right that the wrong thing arrived,
// the seller may be right that it is the right thing or still in transit.
// Both are recorded as accounts, and the copy says so.
export const BARANG_TIDAK_SESUAI_CLAIM_HEADING = 'Barang tidak sesuai?';
export const BARANG_TIDAK_SESUAI_CLAIM_PROMPT =
  'Ceritakan apa yang tidak sesuai. Ini untuk barang yang jelas berbeda dari kesepakatan atau tidak dikirim sama sekali, bukan selisih kecil. Penjual bisa menanggapi dulu sebelum kamu mengajukan laporan resmi.';
// Deliberately a serious example, not a trivial one: the wrong PRODUCT, or
// nothing delivered at all. A color-shade nitpick as the example would invite
// exactly the low-stakes complaints this record should not be filled with.
export const BARANG_TIDAK_SESUAI_CLAIM_PLACEHOLDER =
  'Contoh: Saya bayar iPhone 11, yang datang iPhone 6. Atau: sudah bayar paket PO, sampai sekarang barang tidak dikirim.';
export const BARANG_TIDAK_SESUAI_CLAIM_SUBMIT = 'Catat keterangan saya';

export const PENJUAL_JAWAB_HEADING = 'Pembeli bilang barang tidak sesuai';
export const PENJUAL_JAWAB_PROMPT =
  'Jelaskan dari sisi kamu. Kalau memang keliru, kamu bisa selesaikan langsung dengan pembeli.';
export const PENJUAL_JAWAB_PLACEHOLDER =
  'Contoh: Saya kirim sesuai pesanan, ini nomor resinya. Atau: benar keliru, saya kirim ulang hari ini.';
export const PENJUAL_JAWAB_SUBMIT = 'Catat tanggapan saya';

export const GOODS_DISPUTE_CONSEQUENCES: readonly string[] = [
  'Keterangan ini tercatat sebagai pernyataan Anda, bukan putusan SAKSI.',
  'Pihak lain dapat melihatnya di halaman transaksi ini.',
  'Kesepakatan tetap berjalan. Status dan batas waktu tidak berubah.',
  'Ini belum laporan resmi. Kalau tetap tidak selesai, laporan bisa diajukan setelah batas waktu lewat.',
];
export const GOODS_DISPUTE_EXHAUSTED_NOTE =
  'Batas dua kali klarifikasi sudah tercapai. Kedua keterangan tercatat. Kalau masih belum selesai, pihak yang dirugikan dapat mengajukan laporan setelah batas waktu lewat.';
// Shown while the goods-dispute state is still loading — until it resolves, the
// formal-report path stays hidden so a buyer can't bypass the clarification
// loop (§42) before it is known whether rounds remain.
export const GOODS_DISPUTE_LOADING_LABEL = 'Memuat pilihan…';
export const STATEMENT_KIND_LABELS: Record<string, string> = {
  DANA_BELUM_MASUK: 'Keterangan penjual: dana belum masuk',
  BARANG_TIDAK_SESUAI: 'Keterangan pembeli: barang tidak sesuai',
  PENJUAL_JAWAB: 'Tanggapan penjual',
};

// §31 (2026-07-21) — the merged buyer page. SAKSI-MASTER.md §5's Page 1a
// names the primary action "Kirim bukti transfer"; that string is reused
// here verbatim rather than reworded. The money note restates Law 6 in the
// one place a buyer might otherwise assume SAKSI is holding their payment.
export const SEND_BUKTI_LABEL = 'Kirim bukti transfer';
export const BUKTI_FIELD_LABEL = 'Bukti transfer';
export const SEND_BUKTI_SECTION_HEADING = 'Sudah transfer? Kirim buktinya';
export const MONEY_NEVER_TOUCHES_SAKSI_NOTE =
  'Transfer langsung dari m-banking kamu ke rekening di atas. SAKSI tidak menerima atau menahan uangmu, hanya mencatat.';

// ============================================================
// §32 (2026-07-21) — seller home (SAKSI-MASTER.md §5's S1 Beranda).
//
// The device-local note is load-bearing, not a disclaimer to bury: this list
// is an index over links this browser has seen, NOT an account. Saying so
// plainly is what keeps "Tagihan saya" from reading as a promise of
// durable storage the app cannot keep. Same discipline as the forced-check
// empty state — the honest weaker sentence beats the reassuring stronger one.
// ============================================================
// §34 — "Riwayat tagihan", not "Tagihan saya". More honest about what this
// actually is: a record of tagihan this browser has seen, not an account you
// own. "Saya" implies possession the app cannot back up (no login, no
// cross-device), which is exactly the promise SAYA_DEVICE_NOTE has to walk
// back two lines later. "Riwayat" claims only what is true.
export const SAYA_HEADING = 'Riwayat tagihan';
export const SAYA_INTRO = 'Tagihan yang dibuat dari perangkat ini.';
export const SAYA_DEVICE_NOTE =
  'Daftar ini disimpan di perangkat ini saja, bukan akun. Kalau kamu ganti HP atau hapus data browser, daftarnya hilang. Simpan juga link tagihannya.';
// No create button on this page (§34), so the empty state has to point
// somewhere itself rather than leaving a dead end.
export const SAYA_EMPTY_STATE =
  'Belum ada tagihan yang dibuat dari perangkat ini. Tagihan yang kamu buat nanti muncul di sini otomatis.';
export const SAYA_REFRESH_FAILED = 'Status terbaru tidak dapat dimuat. Coba lagi nanti.';
export const SAYA_RATE_LIMITED = 'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.';
export const SAYA_FORGET_LABEL = 'Hapus dari daftar';
export const SAYA_FORGET_NOTE = 'Menghapus dari daftar ini tidak menghapus catatan kesepakatannya.';
export const CTA_RIWAYAT_TAGIHAN = 'Riwayat tagihan';

// Track-record summary. Counts per outcome only — never a score, never a
// badge, never a safety colour (Law 4). "Tercatat" not "berhasil": the
// number is what the ledger holds, not a compliment.
export const SAYA_RECORD_HEADING = 'Rekam jejak dari perangkat ini';
export function formatSayaRecord(total: number, selesai: number, berjalan: number): string {
  return `${total} tagihan tercatat · ${selesai} selesai · ${berjalan} berjalan`;
}

// Status chips. Neutral, literal wording — each chip names the state exactly
// as it is, so anyone who sees it can read the truth off it without inference.
// §45 (2026-07-21): the three lifecycle chips were made literal per the state
// redesign — "Pembeli klaim membayar" (it is a claim, not a settled fact),
// "Pembayaran diterima" (seller confirmed the money = the realistic success),
// "Barang diterima" (buyer confirmed goods = the gold terminal). "Sudah
// dibayar"/"Selesai" were retired: they implied the process was finished when
// it may not be.
export const SAYA_STATUS_LABELS: Record<string, string> = {
  DRAF: 'Menunggu pembeli',
  DIAJUKAN: 'Menunggu',
  DISEPAKATI: 'Menunggu pembayaran',
  DIBAYAR_DIKLAIM: 'Pembeli klaim membayar',
  DIKONFIRMASI_TERIMA: 'Pembayaran diterima',
  SELESAI: 'Barang diterima',
  TIDAK_DIPENUHI: 'Tidak dipenuhi',
  SENGKETA: 'Klaim berbeda',
  DIBATALKAN_BERSAMA: 'Dibatalkan bersama',
  TIDAK_DILANJUTKAN: 'Tidak dilanjutkan',
  KEDALUWARSA: 'Kedaluwarsa',
  DIKEMBALIKAN_PENUH: 'Dikembalikan penuh',
  DIKEMBALIKAN_SEBAGIAN: 'Dikembalikan sebagian',
};

// Locked upsell (SAKSI-MASTER.md §6.1). Shown greyed and inert — it must not
// look purchasable while there is nothing to purchase. States what it would
// unlock and nothing about trust: paying never buys a track record.
export const TOKO_PRO_LOCKED_TITLE = 'Toko Saksi Pro';
export const TOKO_PRO_LOCKED_PRICE = 'Rp200.000 · per tahun';
export const TOKO_PRO_LOCKED_DESC =
  'Nanti: logo kamu di tagihan, dan link toko sendiri (saksi.app/namatoko). Rekam jejakmu tetap tercatat apa adanya dan tidak bisa dibeli.';
export const TOKO_PRO_LOCKED_BADGE = 'Belum tersedia';
export const OCR_AUTHENTICITY_DISCLAIMER =
  'Pemeriksaan konsistensi bukan pemeriksaan keaslian. Buka aplikasi perbankan Anda sendiri sebelum mengonfirmasi.';

// C5 — DIKONFIRMASI_TERIMA, both sides
export const SHIP_INSTRUCTION =
  'Uang telah dikonfirmasi diterima. Kirim barang sesuai kesepakatan.';
export const BARANG_TIDAK_SESUAI_BUTTON = 'Barang tidak sesuai kesepakatan';

// C6 — "barang tidak sesuai" report filing (copy-id.md §16, locked)
export const BARANG_TIDAK_SESUAI_PROMPT =
  'Bagian mana dari keterangan di atas yang tidak dipenuhi?';
// §25 (2026-07-21) — the last bullet used to read "Nomor HP pelapor
// terverifikasi. Laporan palsu juga tercatat permanen atas nomor ini." With
// the OTP step removed, the first sentence of that bullet became false: the
// reporter's number is the one already recorded as a party to this deal, but
// nothing proves they currently possess it. The false half is gone; the true
// half — that a false report is itself permanently on the record, attributed
// to that party — is kept, because it is still exactly true and it is the
// part that actually deters a bogus filing.
export const BARANG_TIDAK_SESUAI_CONSEQUENCES: readonly string[] = [
  'Laporan tercatat sebagai klaim Anda, bukan putusan SAKSI.',
  'Penjual mendapat 14 hari untuk menanggapi.',
  'Laporan Anda dan tanggapan pihak lain (jika ada) sama-sama tercatat permanen di catatan rekening ini.',
  'SAKSI tidak menengahi dan tidak mengembalikan dana.',
  'Laporan palsu juga tercatat permanen atas nomor HP yang tercatat sebagai pihak dalam kesepakatan ini.',
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

// §25 (2026-07-21) — the whole OTP string set (OTP_STEP_HEADING,
// OTP_SEND_BUTTON_LABEL, OTP_RESEND_BUTTON_LABEL, OTP_CODE_FIELD_LABEL,
// OTP_CODE_FORMAT_HINT, OTP_VERIFY_BUTTON_LABEL, ERROR_OTP_*) is retired
// along with lib/otp.ts and the OTP step in both report modals. Noted here
// rather than silently dropped, same treatment every other retirement in
// this file gets. The `otp_codes` table from migration 0020 is deliberately
// NOT dropped — leaving an unused table costs nothing and dropping one is
// irreversible.
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
const FLAG_BODY_STEM = (tgl: string) =>
  `1 kesepakatan tercatat tidak dipenuhi (${tgl}). Identitas para pihak tidak diverifikasi.`;

export function formatFlagBodyStem(tgl: string): string {
  return FLAG_BODY_STEM(tgl);
}

export const FLAG_TAIL_SILENT = 'Terlapor tidak merespons dalam 14 hari.';
// Replaces FLAG_TAIL_SILENT when hak jawab was filed — permanent once a
// response exists (2026-07-20 decision: resolved a conflict where
// data-model.md's prose read as a second silence window that could
// eventually re-publish FLAG_TAIL_SILENT despite a real response on
// record — rejected as a false statement on a public record).
export const FLAG_TAIL_DISPUTED = 'Terlapor memberikan tanggapan. Status: klaim berbeda.';
export const FLAG_EVIDENCE_SUB_LINE = 'Terlapor menyertakan bukti pada tanggapannya.';

// copy-id.md §1 — flag identifier lines. All deals are standard (GRATIS) today,
// so only the rekening line is shown. Phone hash and identity-verified markers
// are reserved for future seller-account-tier gating.
export function formatFlagRekeningLine(bank: string, rekeningMasked: string): string {
  return `Rekening: ${bank} ${rekeningMasked}`;
}
export function formatFlagPhoneVerifiedLine(hashFragment: string): string {
  return `Nomor HP terverifikasi · ID: ${hashFragment}`;
}
export const FLAG_IDENTITY_VERIFIED_LINE = 'Identitas terverifikasi (e-KYC)';

// C7 — SELESAI, minimal placeholder pending a real design pass
export const SELESAI_CLOSING_LINE = 'Kesepakatan selesai. Tercatat di SAKSI.';

// C7 — exit state panels (5 terminal states, reachable via RPC). Read-only,
// both sides identical, no actions. Badges are new UI chrome (not in
// copy-id.md, same low-stakes category as other approved-inline labels —
// §7 has no badge-style short label for any of these, only full sentences).
//
// Closing lines corrected 2026-07-20 (review finding): the first version of
// these five invented new wording instead of reusing copy-id.md §7's
// already-locked record lines, which exist for exactly these states and
// include a [tgl] interpolation the invented versions dropped entirely.
// Fixed to the exact §7 text, now as format functions taking the relevant
// past event's date (see paymentActions.ts's getEventCreatedAt) — the same
// treatment every other locked string with an interpolated value already
// gets (formatAccountHistory, formatDeadlineNudgeMessage, etc.).
export const DIBATALKAN_BERSAMA_BADGE = 'Dibatalkan Bersama';
export function formatDibatalkanBersamaLine(tgl: string): string {
  return `Dibatalkan atas kesepakatan bersama (${tgl}).`;
}
export const TIDAK_DILANJUTKAN_BADGE = 'Tidak Dilanjutkan';
export function formatTidakDilanjutkanLine(tgl: string): string {
  return `Disepakati ${tgl}; tidak dilanjutkan. Belum ada transfer tercatat.`;
}
export const KEDALUWARSA_BADGE = 'Kedaluwarsa';
// Two [tgl]s in §7's locked text: when DISEPAKATI happened, then when
// payment was claimed (BUKTI_UPLOADED) — KEDALUWARSA is only reachable from
// DIBAYAR_DIKLAIM/DIKONFIRMASI_TERIMA (migration 0018's get_kedaluwarsa_
// candidates), so a payment claim always exists by the time this fires.
export function formatKedaluwarsaLine(disepakatiTgl: string, diklaimTgl: string): string {
  return `Disepakati ${disepakatiTgl}; pembayaran diklaim ${diklaimTgl}, tidak ada tindak lanjut dari kedua pihak selama 30 hari. Catatan kedaluwarsa.`;
}
export const DIKEMBALIKAN_PENUH_BADGE = 'Dikembalikan Penuh';
export function formatDikembalikanPenuhLine(tgl: string): string {
  return `Dibatalkan; dana dikembalikan penuh, dikonfirmasi kedua pihak (${tgl}).`;
}
export const DIKEMBALIKAN_SEBAGIAN_BADGE = 'Dikembalikan Sebagian';
export function formatDikembalikanSebagianLine(tgl: string): string {
  return `Dibatalkan; sebagian dana dikembalikan, dikonfirmasi kedua pihak (${tgl}).`;
}

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
  // C7 — exit state + breach pipeline event labels (2026-07-20). Same
  // fallback-to-raw-name contract as every other unmapped event; these are
  // the ones reachable via the 5 terminal exit states + publication sweep.
  CANCEL_AGREED: 'Kesepakatan dibatalkan bersama',
  CANCEL_UNILATERAL: 'Kesepakatan tidak dilanjutkan',
  KEDALUWARSA_LAPSED: 'Kesepakatan kedaluwarsa',
  REFUND_UPLOADED: 'Bukti pengembalian diunggah',
  REFUND_CONFIRMED: 'Pengembalian dana dikonfirmasi',
  REFUND_CONFIRMED_PARTIAL: 'Pengembalian dana sebagian dikonfirmasi',
  FLAG_PUBLISHED: 'Laporan dipublikasikan',
  SENGKETA_KADALUARSA: 'Jendela hak jawab berakhir',
};

// copy-id.md §16 — minimal fill-ins for the non-Section-C-defined side of
// each merged status page (e.g. what Penjual sees while waiting at
// DISEPAKATI, what Pembeli sees while waiting at DIBAYAR_DIKLAIM).
export const WAITING_FOR_PAYMENT_PROOF =
  'Menunggu pihak pembeli mengunggah bukti transfer.';
export const WAITING_FOR_RECEIPT_CONFIRMATION =
  'Menunggu konfirmasi penerimaan dari pihak penjual.';

// §9 WA notification templates removed 2026-07-24 — Fonnte client deleted
// pending Meta Cloud API integration. The NUDGE_SENT event recording in the
// deadline sweep remains; delivery will be re-wired when a channel exists.
// (formatDeadlineNudgeMessage, formatDisepakatiMessage,
//  formatBuktiUploadedMessage, formatReceiptConfirmedMessage,
//  formatBreachReportFiledMessage, formatHakJawabFiledMessage)
//
// formatPaymentNotReceivedMessage retired §24, formatOtpMessage retired §25,
// formatCounterpartJoinedMessage/formatPartyAcceptedMessage retired earlier.

// ============================================================
// UI chrome added for the UX-audit fix pass (2026-07-20) — not legally
// adjacent copy, not in copy-id.md by design (same category as
// PENDING_DEFAULT_LABEL / COPY_REKENING_COPIED_LABEL above), but centralized
// here per Law 3 discipline.
// ============================================================

// Persistent deal-link card (shown on every non-terminal deal status, not
// just DRAF — the audit's "lost link = lost deal" finding, since identity is
// phone-only with no session).
export const DEAL_LINK_CARD_HEADING = 'Link tagihan ini';
export const DEAL_LINK_SAVE_HINT =
  'Simpan link ini. Tanpa link, tagihan tidak dapat dibuka kembali.';
export const SHARE_TO_WHATSAPP_LABEL = 'Bagikan ke WhatsApp';

// Progress stepper (6 nodes: Dibuat -> Bergabung -> Disepakati -> Dibayar ->
// Diterima -> Barang diterima), shown on every deal-page status. §45: the final
// node was 'Selesai', retired for the same reason as the chip — it implied the
// whole thing was concluded. The literal terminal is "Barang diterima".
export const PROGRESS_STEP_LABELS: readonly string[] = [
  'Dibuat',
  'Bergabung',
  'Disepakati',
  'Dibayar',
  'Pembayaran diterima',
  'Barang diterima',
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
// Renamed 2026-07-21 (copy-id.md §23): was 'Lihat detail lengkap', which did
// not say what the detail was *about*. Under the locked-link flow the buyer
// never types a rekening themselves, so this expander is the only place they
// can inspect the destination account's own record — the label has to name
// the rekening, or it reads as "more detail about this invoice".
export const LEDGER_DETAIL_LINK_LABEL = 'Lihat detail lengkap history rekening';
export const LEDGER_EMPTY_STATE = 'Belum ada riwayat lengkap untuk ditampilkan.';
export const ERROR_LEDGER_UNAVAILABLE = 'Riwayat lengkap tidak dapat dimuat saat ini. Coba lagi.';

// §45 — per-row bucket labels, reworked to the same fair-attribution taxonomy
// as the aggregate line (formatAccountHistoryFull). Kept identical to the
// aggregate wording rather than reworded per-row.
export const LEDGER_BUCKET_LABELS: Record<
  'BERHASIL' | 'KLAIM_BARANG' | 'BELUM_DIKONFIRMASI' | 'KLAIM_PEMBAYARAN',
  string
> = {
  BERHASIL: 'transaksi berhasil',
  KLAIM_BARANG: 'klaim barang berbeda',
  BELUM_DIKONFIRMASI: 'belum dikonfirmasi penjual',
  KLAIM_PEMBAYARAN: 'klaim pembayaran berbeda',
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

// §20 — "Tagihan" reframe: seller create-and-send surface (copy-id.md §20).
// Centralized here so the invariant audit sees every user-facing string in one
// place. Truthful only: no "aman", no "terpercaya", no guarantee.
export const LANDING_HEADING = 'Buat tagihan buat pembeli kamu.';
export const LANDING_SUBHEAD =
  'Isi barang, harga, dan rekening kamu. Kirim link-nya ke pembeli, bukan nomor rekening. Tiap pembayaran tercatat otomatis.';
export const LANDING_STEPS: readonly { title: string; body: string }[] = [
  { title: 'Isi tagihan', body: 'Barang atau jasa, harga, dan nomor rekening kamu.' },
  { title: 'Kirim link-nya ke pembeli', body: 'Bukan nomor rekening, cukup satu link.' },
  {
    title: 'Pembeli bayar & upload bukti',
    body: 'Setiap langkah tercatat otomatis. Ada catatannya kalau ada masalah.',
  },
];
export const CTA_BUAT_TAGIHAN = 'Buat Tagihan';
export const CTA_CEK_REKENING = 'Cek Rekening';

// §23 — locked-invoice presentation. UI chrome, not legally adjacent (same
// category as PENDING_DEFAULT_LABEL): these label an invoice, they don't
// assert anything about the parties. The witness mark deliberately states
// what SAKSI does (records) and never what the deal is (safe).
export const INVOICE_EYEBROW = 'Tagihan · SAKSI';
export const INVOICE_WITNESS_MARK = 'Saksi menyaksikan transaksi ini';
export const INVOICE_LOCKED_NOTE = 'Link dari penjual · terkunci';
export const INVOICE_NUMBER_LABEL = 'No. tagihan';
export const INVOICE_FOR_LABEL = 'Untuk';
// §36 — the amount is copyable too. A buyer typing a nominal by hand into
// m-banking is a transposition error waiting to happen, and a mismatched
// nominal is exactly what the OCR check then flags and what the penjual then
// disputes. Copying digits removes a whole class of avoidable dispute.
// Copies raw digits (no "Rp", no separators) because that is what a banking
// app's amount field accepts.
export const COPY_AMOUNT_LABEL = 'Salin nominal';
export const COPY_AMOUNT_COPIED_LABEL = 'Nominal tersalin';

export const BUAT_HEADING = 'Buat Tagihan';
export const BUAT_INTRO =
  'Isi tagihan buat pembeli kamu. Nanti kamu dapat link buat dikirim ke mereka.';
export const BUAT_SECTION_DATA = 'Data kamu';
export const BUAT_SECTION_BARANG = 'Barang & harga';
export const BUAT_SECTION_REKENING = 'Rekening pembayaran kamu';

// BUAT_DEADLINE_LABEL / BUAT_DEADLINE_NOTE retired §29 (2026-07-21). §27 added
// them to state the auto-derived window on the create form. Removed on review:
// on a form whose whole job is "make a bill and send it", a box explaining
// what happens when the deadline lapses reads as a warning about failure
// before the seller has done anything. The deadline is still shown where it is
// actually load-bearing — on the invoice the buyer reads (formatDeadlineWib),
// where it tells them how long they have rather than what goes wrong.

// ============================================================
// QRIS payment method (migration 0036) — copy-id.md §47, locked 2026-07-24.
// ============================================================
export const PAYMENT_METHOD_LABEL = 'Metode pembayaran';
export const PAYMENT_METHOD_REKENING_LABEL = 'Rekening bank';
export const PAYMENT_METHOD_QRIS_LABEL = 'QRIS';

export const QRIS_UPLOAD_LABEL = 'Unggah kode QRIS kamu';
export const QRIS_UPLOAD_HINT =
  'Unduh atau screenshot kode QRIS dari aplikasi bank/e-wallet kamu, lalu unggah di sini.';

export const ERROR_QRIS_FILE_REQUIRED = 'Unggah gambar QRIS terlebih dahulu.';
export const ERROR_QRIS_NO_QR_FOUND = 'Kode QR tidak ditemukan pada gambar ini. Coba unggah ulang.';
export const ERROR_QRIS_INVALID_CHECKSUM =
  'Kode QRIS tidak valid atau rusak. Coba unggah ulang dari sumber aslinya.';
export const ERROR_QRIS_NOT_QRIS = 'Kode QR ini bukan kode QRIS.';
export const ERROR_QRIS_UPLOAD_FAILED = 'Gagal mengunggah gambar QRIS. Coba lagi.';

export const QRIS_MERCHANT_NAME_LABEL = 'Nama merchant';
export const QRIS_MERCHANT_CITY_LABEL = 'Kota merchant';

// Shown to the buyer in place of RekeningCopyCard for a QRIS deal — the
// account number never appears at all for this payment method, so the copy
// must not imply one exists.
export const QRIS_SCAN_INSTRUCTION =
  'Pindai kode QRIS ini menggunakan aplikasi bank atau e-wallet kamu untuk membayar.';

// Flag page's identifiers block, QRIS-payment-method variant of formatFlagRekeningLine.
export function formatFlagQrisLine(merchantName: string): string {
  return `QRIS: ${merchantName}`;
}
