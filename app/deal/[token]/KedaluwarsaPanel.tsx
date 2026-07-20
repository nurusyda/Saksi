import { DealTimeline } from './DealTimeline';
import { getEventCreatedAt } from './paymentActions';
import { formatDate } from '@/lib/format';
import { KEDALUWARSA_BADGE, formatKedaluwarsaLine, RIWAYAT_HEADING } from '@/lib/copy';

// KEDALUWARSA is only reachable from DIBAYAR_DIKLAIM/DIKONFIRMASI_TERIMA
// (migration 0018's get_kedaluwarsa_candidates), so BUKTI_UPLOADED always
// exists by the time this panel renders — both lookups below are expected
// to succeed, the fallback '-' is defensive only.
export async function KedaluwarsaPanel({ token }: { token: string }) {
  const [disepakatiAt, diklaimAt] = await Promise.all([
    getEventCreatedAt(token, 'ACCEPTED'),
    getEventCreatedAt(token, 'BUKTI_UPLOADED'),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
        <span className="inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          {KEDALUWARSA_BADGE}
        </span>
        <p className="mt-3 text-sm text-zinc-700">
          {formatKedaluwarsaLine(
            disepakatiAt ? formatDate(disepakatiAt) : '-',
            diklaimAt ? formatDate(diklaimAt) : '-',
          )}
        </p>
      </div>
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={token} />
      </div>
    </div>
  );
}
