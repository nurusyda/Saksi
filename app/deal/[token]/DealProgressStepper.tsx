import { DealStatus } from '@/lib/db/transitions';
import { PROGRESS_STEP_LABELS } from '@/lib/copy';

// §23 (2026-07-21) — rebuilt as the mockup's vertical "dot-dot" stepper.
//
// The horizontal 6-node version this replaces packed six labels into ~390px,
// which forced 10px type and left each step no room to say anything. Vertical
// gives every step a full line, which matters because this page is the
// accountability surface: if either side is later accused of scamming, this is
// the record that gets shown. It has to be readable, and it has to be obvious
// which steps have actually happened.
//
// Node set and mapping are unchanged — same six PROGRESS_STEP_LABELS, same
// DONE_COUNT per status, same null guard for exit states (KEDALUWARSA and
// friends never reach this page, so they have no entry and render nothing).
const DONE_COUNT: Partial<Record<string, number>> = {
  [DealStatus.DRAF]: 1,
  [DealStatus.DIAJUKAN]: 2,
  [DealStatus.DISEPAKATI]: 3,
  [DealStatus.DIBAYAR_DIKLAIM]: 4,
  [DealStatus.DIKONFIRMASI_TERIMA]: 5,
  [DealStatus.SELESAI]: 6,
};

export function DealProgressStepper({ status }: { status: string }) {
  const doneCount = DONE_COUNT[status];
  if (doneCount === undefined) return null;

  const last = PROGRESS_STEP_LABELS.length - 1;

  return (
    <ol className="mb-6 rounded-2xl border border-zinc-200 bg-white px-5 py-5">
      {PROGRESS_STEP_LABELS.map((label, i) => {
        const done = i < doneCount;
        const current = i === doneCount && doneCount < PROGRESS_STEP_LABELS.length;

        return (
          <li key={label} className="relative pb-5 pl-8 last:pb-0">
            {/* Rail to the next node. Solid once passed, faint ahead. */}
            {i < last && (
              <span
                aria-hidden="true"
                className={
                  'absolute bottom-0 left-[8px] top-[18px] w-0.5 ' +
                  (done ? 'bg-witness' : 'bg-zinc-200')
                }
              />
            )}

            <span
              aria-hidden="true"
              className={
                'absolute left-0 top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 text-[10px] font-extrabold ' +
                (done
                  ? 'border-witness bg-witness text-white'
                  : current
                    ? 'border-witness bg-white ring-4 ring-witness-soft'
                    : 'border-zinc-300 bg-white')
              }
            >
              {done ? '✓' : ''}
            </span>

            <p
              className={
                'text-sm leading-tight ' +
                (done || current ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-400')
              }
            >
              {label}
            </p>
            {current && (
              <p className="mt-0.5 text-xs font-semibold text-witness">Sedang di tahap ini</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
