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
  'Saya menyetujui Syarat & Ketentuan SAKSI, termasuk publikasi catatan wanprestasi, proses hak jawab, dan larangan bukti palsu.';

// copy-id.md §15 — description-field placeholder by proposer role
export const ITEM_DESC_PLACEHOLDER: Record<string, string> = {
  PENJUAL: 'Contoh: "Preorder album [nama grup], termasuk photocard, dikirim setelah rilis."',
  PEMBELI: 'Contoh: "Preorder album [nama grup], termasuk photocard, dikirim setelah rilis."',
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
  'Tier menentukan bobot pembuktian, bukan tingkat keamanan. Melaporkan wanprestasi selalu gratis di semua tier.';

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
