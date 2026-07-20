import { DealTimeline } from './DealTimeline';
import { getEventCreatedAt } from './paymentActions';
import { formatDate } from '@/lib/format';
import { DIKEMBALIKAN_SEBAGIAN_BADGE, formatDikembalikanSebagianLine, RIWAYAT_HEADING } from '@/lib/copy';

export async function DikembalikanSebagianPanel({ token }: { token: string }) {
  const confirmedAt = await getEventCreatedAt(token, 'REFUND_CONFIRMED_PARTIAL');
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {DIKEMBALIKAN_SEBAGIAN_BADGE}
        </span>
        <p className="mt-3 text-sm text-zinc-700">
          {formatDikembalikanSebagianLine(confirmedAt ? formatDate(confirmedAt) : '-')}
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={token} />
      </div>
    </div>
  );
}
