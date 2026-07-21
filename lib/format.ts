// Shared display formatting — extracted from app/deal/[token]/page.tsx so
// the new Section C panels (DisepakatiPanel, DibayarDiklaimPanel, etc.)
// don't each redefine the same two functions.

export function formatRp(amount: number | bigint): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(amount),
  );
}

export function formatDate(iso: string): string {
  // Date-only strings parse as UTC midnight. Render explicitly in WIB so the
  // displayed calendar date is correct regardless of the server's default TZ.
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

// Display-time truncation of a phone_hash for the ledger's per-row "same
// person" indicator (lib/db/ledger.ts) — not treated as masking, since
// phone_hash is a SHA-256 hex string with no human-readable structure to
// partially redact the way a real phone/rekening is. Lives here, not in
// ledger.ts, so client components can import it without pulling in that
// module's server-only supabaseServer dependency.
export function shortHashFragment(hash: string): string {
  return hash.slice(0, 8);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

// ============================================================
// Ledger time display (2026-07-21). Every timestamp SAKSI shows as part of
// the record goes through one of these three.
//
// Why they exist: `formatDateTime` above renders "21 Juli 2026, 09.34" with
// no timezone marker at all. For a record whose entire purpose is to be
// shown back to a third party during a dispute, a bare wall-clock time is
// ambiguous — the reader cannot tell which zone it was recorded in, and
// Indonesia spans three (WIB/WITA/WIT). UU ITE Pasal 6/15/16 conditions an
// electronic record's evidentiary weight on keautentikan/keutuhan and on
// the system being able to display the record back intact; a timestamp that
// can be read two ways fails that on its face. Standard audit-log practice
// is the same: store UTC, render with an explicit offset or zone label.
//
// Storage is unchanged and already correct — `deal_events.created_at` is
// `timestamptz`, i.e. an absolute UTC instant. These functions only fix the
// display end, and always pin the zone to Asia/Jakarta rather than the
// viewer's local zone, so two parties in different places reading the same
// record see the identical string.
// ============================================================

const WIB_TZ = 'Asia/Jakarta';

/** "21 Jul 2026, 09.34 WIB" — compact, for timeline rows and step times. */
export function formatTimeWib(iso: string): string {
  const s = new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: WIB_TZ,
  });
  return `${s} WIB`;
}

/**
 * "21 Juli 2026, 09.34.07 WIB" — to the second, for the evidence view.
 * Seconds matter here and only here: this is the string a party would point
 * at to establish ordering between two events that happened close together.
 */
export function formatTimeWibPrecise(iso: string): string {
  const s = new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: WIB_TZ,
  });
  return `${s} WIB`;
}

/**
 * "28 Juli 2026, 23.59 WIB" — the deadline as the exact instant it lapses.
 *
 * `deals.deadline` is a naive `date` (a WIB calendar date), and the breach
 * gate is `deadline < getTodayWib()` (breachActions.ts) — strictly less
 * than, so a party has the whole of the deadline date itself to act and
 * eligibility opens at 00.00 WIB the following day. The last moment still
 * inside the window is therefore 23.59 WIB on the deadline date, which is
 * what this renders. Do not "simplify" this to 00.00 of the deadline date:
 * that would state a cutoff a full day earlier than the one the code
 * actually enforces, i.e. a false deadline on a record people rely on.
 */
export function formatDeadlineWib(dateStr: string): string {
  return `${formatDate(dateStr)}, 23.59 WIB`;
}

// Extracted from app/buat/actions.ts's deadline validation (SESSION_LOG.md
// Session 3: "Deadline timezone — new Date(deadline) compared against
// server local time — off by one day for WIB users on a UTC server").
// `deals.deadline` is a naive `date` column, entered and validated as a WIB
// calendar date — never compare it against Postgres's current_date/now()
// directly (session timezone isn't guaranteed to be WIB); compute "today in
// WIB" here instead and pass it in as an explicit parameter.
export function getTodayWib(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// The deadline input's client-side `min` must agree with getTodayWib()'s
// server-side check ("deadline > today in WIB"), or the calendar picker can
// silently allow a date the server then rejects. Same WIB anchor, +1 day.
export function getTomorrowWib(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return new Date(Date.now() + WIB_OFFSET_MS + ONE_DAY_MS).toISOString().slice(0, 10);
}

// Auto-derived deadline (2026-07-21 simplification pass) — the create form
// no longer asks for a manual date. 7 days from creation; PERPANJANGAN
// already exists as the witnessed way to extend it if that's wrong for a
// given deal, so a fixed default doesn't need to fit every case perfectly.
export function getDefaultDeadlineWib(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + WIB_OFFSET_MS + SEVEN_DAYS_MS).toISOString().slice(0, 10);
}
