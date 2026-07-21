import Link from 'next/link';
import type { ReactNode } from 'react';

// ============================================================
// Shared UI primitives (2026-07-21).
//
// Before this, every page hand-rolled its own container, card, field and
// button classes. They had drifted: /buat used `min-h-screen bg-white px-4
// py-10` + `max-w-lg`, the deal page used the same string but with a
// different card treatment, /cek a third. Same product, three looks.
//
// Everything is also mobile-only up to now — a single `max-w-lg` column that
// sits marooned in the middle of a laptop screen. These primitives carry the
// responsive rules in one place: one column on phones, roomier on tablets,
// and a real two-column reading layout on desktop where a page opts into it.
// ============================================================

/**
 * Page container. `wide` opts into the desktop two-column width; leave it
 * off for single-purpose screens (forms, lookups) that read better narrow —
 * a 1200px-wide form is worse than a 640px one, not better.
 */
export function PageShell({
  children,
  backHref = '/',
  backLabel = '← SAKSI',
  wide = false,
}: {
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 sm:px-6 sm:py-10">
      <div className={(wide ? 'max-w-5xl' : 'max-w-xl') + ' mx-auto'}>
        <Link
          href={backHref}
          className="mb-5 inline-block text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900"
        >
          {backLabel}
        </Link>
        {children}
      </div>
    </div>
  );
}

/**
 * Desktop two-column split: main content left, sticky context rail right.
 * Collapses to a single stacked column below `lg`, main content first — the
 * rail holds supporting context (status, history), never anything the user
 * must act on, so it is safe for it to fall below the fold on a phone.
 */
export function SplitLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
      <div className="min-w-0">{main}</div>
      <div className="mt-6 lg:sticky lg:top-10 lg:mt-0">{rail}</div>
    </div>
  );
}

// §41 — every submit in this app waits on something genuinely slow: a
// storage upload, a Gemini OCR round-trip, two chained RPCs. A button whose
// only feedback is swapping its text to "Memproses..." reads as frozen,
// which is what made filling a dispute feel like it had hung.
//
// A spinner is the honest signal here, not a percentage bar: none of these
// operations report progress, so a bar would have to invent one. A moving
// indicator says "still working" without claiming to know how far along it
// is — and inventing progress on a page whose whole job is not overclaiming
// would be the wrong instinct to indulge.
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

/**
 * Button content while a form action is in flight: spinner + label, with the
 * label still carrying the meaning. `aria-live` is deliberately absent — the
 * button's own disabled state already announces the change, and a live region
 * on every button would talk over the user.
 */
export function PendingContent({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <Spinner />
      {label}
    </span>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{subtitle}</p>}
    </div>
  );
}

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={
        'rounded-2xl border border-zinc-200 bg-white ' + (padded ? 'p-5 ' : '') + className
      }
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">{children}</p>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">
      {msg}
    </p>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {children}
    </p>
  );
}

/** Label + optional hint + the control itself. Keeps spacing identical everywhere. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-zinc-800" htmlFor={htmlFor}>
        {label}
      </label>
      {hint && <p className="mb-1 mt-0.5 text-xs text-zinc-500">{hint}</p>}
      <div className={hint ? '' : 'mt-1.5'}>{children}</div>
      <FieldError msg={error} />
    </div>
  );
}

// Shared input styling. Exported as a string (not a component) so native
// <input>/<select>/<textarea> keep all their own props and refs.
export const inputClass =
  'block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 transition-colors focus:border-witness focus:outline-none focus:ring-2 focus:ring-witness-soft';

const buttonBase =
  'flex h-12 w-full items-center justify-center rounded-xl px-6 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export const buttonClass = {
  primary: `${buttonBase} bg-witness text-white hover:bg-witness-hover`,
  ghost: `${buttonBase} border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50`,
  // Muted amber, never red: these actions report a problem, they do not
  // accuse anyone. Red would read as a verdict the record does not support.
  caution: `${buttonBase} border border-muted-amber-line bg-white text-muted-amber hover:bg-zinc-50`,
  dark: `${buttonBase} bg-zinc-900 text-white hover:bg-zinc-800`,
} as const;
