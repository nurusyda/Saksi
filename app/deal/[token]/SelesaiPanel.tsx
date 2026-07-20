import { DealTimeline } from './DealTimeline';
import { SELESAI_CLOSING_LINE, RIWAYAT_HEADING } from '@/lib/copy';

// C7 — minimal, both sides identical, no action buttons, so no phone gate:
// nothing here depends on which party is looking (deal_events carries no
// PII either). Server component — no client state needed, but DealTimeline
// underneath is itself a client component (it fetches via a server action
// on mount), so this composes fine as a server-rendered wrapper around it.
export function SelesaiPanel({ token }: { token: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-800">
          Selesai
        </span>
        <p className="mt-3 text-sm text-zinc-700">{SELESAI_CLOSING_LINE}</p>
      </div>
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={token} />
      </div>
    </div>
  );
}
