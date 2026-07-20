import { DealTimeline } from './DealTimeline';
import { getEventCreatedAt } from './paymentActions';
import { formatDate } from '@/lib/format';
import { TIDAK_DILANJUTKAN_BADGE, formatTidakDilanjutkanLine, RIWAYAT_HEADING } from '@/lib/copy';

// §7's locked line reads "Disepakati [tgl]; tidak dilanjutkan" — tgl is the
// DISEPAKATI date (the ACCEPTED event), not the CANCEL_UNILATERAL date that
// actually ends the deal; matches the locked wording's own framing (when
// the parties agreed, before it stalled), not an arbitrary substitution.
export async function TidakDilanjutkanPanel({ token }: { token: string }) {
  const disepakatiAt = await getEventCreatedAt(token, 'ACCEPTED');
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {TIDAK_DILANJUTKAN_BADGE}
        </span>
        <p className="mt-3 text-sm text-zinc-700">
          {formatTidakDilanjutkanLine(disepakatiAt ? formatDate(disepakatiAt) : '-')}
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={token} />
      </div>
    </div>
  );
}
