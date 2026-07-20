import { DealTimeline } from './DealTimeline';
import { getEventCreatedAt } from './paymentActions';
import { formatDate } from '@/lib/format';
import { DIBATALKAN_BERSAMA_BADGE, formatDibatalkanBersamaLine, RIWAYAT_HEADING } from '@/lib/copy';

export async function DibatalkanBersamaPanel({ token }: { token: string }) {
  const cancelledAt = await getEventCreatedAt(token, 'CANCEL_AGREED');
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {DIBATALKAN_BERSAMA_BADGE}
        </span>
        <p className="mt-3 text-sm text-zinc-700">
          {formatDibatalkanBersamaLine(cancelledAt ? formatDate(cancelledAt) : '-')}
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={token} />
      </div>
    </div>
  );
}
