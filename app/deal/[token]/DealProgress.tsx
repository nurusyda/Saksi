'use client';

import { useState } from 'react';
import { DealStatus } from '@/lib/db/transitions';
import { formatTimeWib } from '@/lib/format';

// ============================================================
// DealProgress (2026-07-21) — replaces DealProgressStepper + LiveIndicator.
//
// Three problems with the pair this replaces:
//   1. The stepper was six labelled nodes rendered unconditionally at the
//      top of the page. On a phone it ate roughly a third of the first
//      screen and pushed the invoice — the thing the buyer actually came to
//      read — below the fold.
//   2. It carried no times. "Dibayar" told you a step happened but not
//      when, which is exactly the fact a record is for.
//   3. "Diperbarui otomatis" lived in a separate pill inside whichever
//      waiting panel happened to be rendering, physically detached from the
//      step it described.
//
// So: collapsed to two compact lines by default (a status line plus a bead
// rail), carrying the live-update signal on the current bead itself as a
// pulse. Expanding reveals the same steps vertically with a WIB timestamp
// per completed step, read from deal_events. Nothing here computes or
// claims anything the ledger does not already hold — the timestamps are the
// event rows' own created_at.
// ============================================================

const STEPS: { label: string; event: string }[] = [
  { label: 'Tagihan dibuat', event: 'CREATED' },
  { label: 'Pembeli bergabung', event: 'COUNTERPART_JOINED' },
  { label: 'Disepakati', event: 'ACCEPTED' },
  { label: 'Bukti transfer dikirim', event: 'BUKTI_UPLOADED' },
  { label: 'Pembayaran diterima penjual', event: 'RECEIPT_CONFIRMED' },
  { label: 'Barang diterima', event: 'FULFILLMENT_CONFIRMED' },
];

const DONE_COUNT: Partial<Record<string, number>> = {
  [DealStatus.DRAF]: 1,
  [DealStatus.DIAJUKAN]: 2,
  [DealStatus.DISEPAKATI]: 3,
  [DealStatus.DIBAYAR_DIKLAIM]: 4,
  [DealStatus.DIKONFIRMASI_TERIMA]: 5,
  [DealStatus.SELESAI]: 6,
};

// What the deal is waiting on right now, phrased as a fact about the deal
// rather than an instruction to whoever happens to be reading.
const CURRENT_LINE: Partial<Record<string, string>> = {
  [DealStatus.DRAF]: 'Menunggu pembeli membuka tagihan',
  [DealStatus.DIAJUKAN]: 'Menunggu kesepakatan tercatat',
  [DealStatus.DISEPAKATI]: 'Menunggu bukti transfer dari pembeli',
  [DealStatus.DIBAYAR_DIKLAIM]: 'Menunggu penjual konfirmasi dana',
  [DealStatus.DIKONFIRMASI_TERIMA]: 'Menunggu pembeli konfirmasi barang diterima',
  [DealStatus.SELESAI]: 'Barang diterima',
};

export type EventTime = { event: string; created_at: string };

export function DealProgress({
  status,
  events,
}: {
  status: string;
  events: EventTime[];
}) {
  const [open, setOpen] = useState(false);

  const doneCount = DONE_COUNT[status];
  if (doneCount === undefined) return null;

  // First occurrence wins: an event name can legitimately repeat (self
  // transitions like NUDGE_SENT, or a re-uploaded bukti), and the step is
  // "when this first happened", not "the most recent time it happened".
  const timeOf = (event: string) => events.find((e) => e.event === event)?.created_at;

  const isSelesai = status === DealStatus.SELESAI;
  const currentLine = CURRENT_LINE[status] ?? 'Sedang berjalan';

  return (
    <div className="mb-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
          {!isSelesai && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-witness opacity-60" />
          )}
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-witness" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-zinc-900">{currentLine}</span>
          <span className="mt-0.5 block text-[11px] text-zinc-500">
            Langkah {Math.min(doneCount, STEPS.length)} dari {STEPS.length} · diperbarui otomatis
          </span>
        </span>

        <span className="shrink-0 text-xs font-semibold text-witness">
          {open ? 'Tutup' : 'Riwayat'}
        </span>
      </button>

      {/* Bead rail — the whole lifecycle in one compact row, always visible. */}
      <div className="mt-3 flex items-center gap-1" aria-hidden="true">
        {STEPS.map((s, i) => {
          const done = i < doneCount;
          const current = i === doneCount && !isSelesai;
          return (
            <span
              key={s.event}
              className={
                'h-1.5 flex-1 rounded-full ' +
                (current
                  ? 'bg-witness shadow-[0_0_0_3px_var(--witness-soft)]'
                  : done
                    ? 'bg-witness'
                    : 'bg-zinc-200')
              }
            />
          );
        })}
      </div>

      {open && (
        <ol className="mt-4 border-t border-zinc-100 pt-3">
          {STEPS.map((s, i) => {
            const done = i < doneCount;
            const current = i === doneCount && !isSelesai;
            const at = timeOf(s.event);
            return (
              <li key={s.event} className="flex items-baseline gap-2.5 py-1">
                <span
                  aria-hidden="true"
                  className={
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full ' +
                    (done ? 'bg-witness' : 'bg-zinc-300')
                  }
                />
                <span
                  className={
                    'flex-1 text-xs ' +
                    (done ? 'font-semibold text-zinc-800' : 'text-zinc-400')
                  }
                >
                  {s.label}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
                  {at ? formatTimeWib(at) : current ? 'sedang berjalan' : '—'}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
