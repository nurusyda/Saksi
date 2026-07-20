import { DealStatus } from '@/lib/db/transitions';
import { PROGRESS_STEP_LABELS } from '@/lib/copy';

// UX-audit fix pass (2026-07-20) — the audit found no progress indicator
// anywhere across the deal lifecycle: a party landing mid-flow (e.g. from a
// WA nudge, or reopening the link days later) had no way to see where the
// deal stood relative to the whole loop. Six nodes, one per DealStatus this
// page actually renders a panel for (page.tsx's allowed-status list) —
// exit states like KEDALUWARSA never reach here, so DONE_COUNT has no entry
// for them and the stepper simply doesn't render (see the null guard below).
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

  return (
    <div className="mb-6 flex items-start" aria-hidden="true">
      {PROGRESS_STEP_LABELS.map((label, i) => {
        const done = i < doneCount;
        const current = i === doneCount && doneCount < PROGRESS_STEP_LABELS.length;
        return (
          <div key={label} className="flex flex-1 flex-col items-center last:flex-none">
            <div className="flex w-full items-center">
              <div
                className={
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ' +
                  (done
                    ? 'bg-zinc-900 text-white'
                    : current
                      ? 'border-2 border-zinc-900 text-zinc-900'
                      : 'border border-zinc-300 text-zinc-400')
                }
              >
                {i + 1}
              </div>
              {i < PROGRESS_STEP_LABELS.length - 1 && (
                <div className={'mx-1 h-0.5 flex-1 ' + (done ? 'bg-zinc-900' : 'bg-zinc-200')} />
              )}
            </div>
            <p
              className={
                'mt-1 text-center text-[10px] leading-tight ' +
                (done || current ? 'font-medium text-zinc-700' : 'text-zinc-400')
              }
            >
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
