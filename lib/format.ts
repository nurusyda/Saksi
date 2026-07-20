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
