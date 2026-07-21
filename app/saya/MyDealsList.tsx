'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyDealsSummary, type DealSummary } from './actions';
import { useMyDeals, forgetDeal } from '@/lib/sellerDeals';
import { Card, SectionLabel, ErrorBanner } from '@/components/ui';
import { formatRp, formatDeadlineWib } from '@/lib/format';
import {
  SAYA_DEVICE_NOTE,
  SAYA_EMPTY_STATE,
  SAYA_REFRESH_FAILED,
  SAYA_RATE_LIMITED,
  SAYA_FORGET_LABEL,
  SAYA_FORGET_NOTE,
  SAYA_RECORD_HEADING,
  SAYA_STATUS_LABELS,
  formatSayaRecord,
  TOKO_PRO_LOCKED_TITLE,
  TOKO_PRO_LOCKED_PRICE,
  TOKO_PRO_LOCKED_DESC,
  TOKO_PRO_LOCKED_BADGE,
} from '@/lib/copy';

// §32 — SAKSI-MASTER.md §5's S1 Beranda.
//
// The list of tokens comes from this browser (lib/sellerDeals.ts); the
// statuses come from the server, because a locally-cached status would go
// stale the moment the buyer did anything. So: local index, live truth.

const SELESAI_STATUSES = new Set(['SELESAI']);
const BERJALAN_STATUSES = new Set([
  'DRAF',
  'DIAJUKAN',
  'DISEPAKATI',
  'DIBAYAR_DIKLAIM',
  'DIKONFIRMASI_TERIMA',
]);

// One neutral chip style for every state. Deliberately not colour-coded by
// outcome: a green "Selesai" against a red "Tidak dipenuhi" would be a safety
// colour on a record, which Law 4 forbids. The words carry the meaning.
function StatusChip({ status }: { status: string }) {
  return (
    <span className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">
      {SAYA_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function MyDealsList() {
  const stored = useMyDeals();
  const [summaries, setSummaries] = useState<DealSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenKey = stored.map((d) => d.token).join(',');

  useEffect(() => {
    // No setSummaries([]) for the empty case: `summaries` staying null is
    // already the correct state (nothing was fetched), the empty-list branch
    // below renders off `stored.length`, and setting state synchronously in
    // an effect body is exactly the cascading-render pattern react-hooks
    // warns about.
    if (stored.length === 0) return;
    let ignore = false;
    getMyDealsSummary(stored.map((d) => d.token))
      .then((r) => {
        if (ignore) return;
        if (r === 'rate_limited') {
          setError(SAYA_RATE_LIMITED);
          return;
        }
        setSummaries(r);
      })
      .catch(() => {
        if (!ignore) setError(SAYA_REFRESH_FAILED);
      });
    return () => {
      ignore = true;
    };
    // tokenKey, not `stored`: useMyDeals returns a new array identity on
    // every write, and depending on the array itself would refetch on any
    // unrelated change to the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey]);

  const byToken = new Map((summaries ?? []).map((s) => [s.token, s]));
  const total = stored.length;
  const selesai = (summaries ?? []).filter((s) => SELESAI_STATUSES.has(s.status)).length;
  const berjalan = (summaries ?? []).filter((s) => BERJALAN_STATUSES.has(s.status)).length;

  return (
    <div className="flex flex-col gap-4">
      {total > 0 && (
        <Card>
          <SectionLabel>{SAYA_RECORD_HEADING}</SectionLabel>
          <p className="mt-2 text-sm font-semibold text-zinc-800">
            {summaries === null ? '—' : formatSayaRecord(total, selesai, berjalan)}
          </p>
        </Card>
      )}

      {/* §34 — no create button on this page at all. This is a riwayat: a
          record of what already exists, not a place you make things. Putting
          "+ Buat Tagihan" here duplicated the landing's own primary CTA and
          made the page read as a detour on the way to /buat. Creating starts
          from the landing; PageShell's back link is the way there. */}
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {total === 0 ? (
        <Card>
          <p className="text-sm leading-relaxed text-zinc-600">{SAYA_EMPTY_STATE}</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {stored.map((d) => {
            const s = byToken.get(d.token);
            return (
              <Card key={d.token} padded={false}>
                <Link
                  href={`/deal/${d.token}`}
                  className="block px-4 py-3.5 transition-colors hover:bg-zinc-50 sm:px-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-900">
                      {s?.itemDesc ?? d.itemDesc}
                    </p>
                    {s && <StatusChip status={s.status} />}
                  </div>
                  <p className="mt-1 text-sm font-semibold text-zinc-700">
                    {formatRp(s?.amountIdr ?? d.amountIdr)}
                  </p>
                  {s && (
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      Batas waktu {formatDeadlineWib(s.deadline)}
                    </p>
                  )}
                </Link>
                <div className="border-t border-zinc-100 px-4 py-2 sm:px-5">
                  <button
                    type="button"
                    onClick={() => forgetDeal(d.token)}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900"
                  >
                    {SAYA_FORGET_LABEL}
                  </button>
                </div>
              </Card>
            );
          })}
          <p className="text-[11px] leading-relaxed text-zinc-500">{SAYA_FORGET_NOTE}</p>
        </div>
      )}

      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-relaxed text-zinc-600">
        {SAYA_DEVICE_NOTE}
      </p>

      {/* Locked upsell (SAKSI-MASTER.md §6.1) — inert on purpose. Not a
          button, no handler: it must not look purchasable while there is
          nothing to purchase. */}
      <div
        aria-disabled="true"
        className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3.5 sm:px-5"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-zinc-500">🔒 {TOKO_PRO_LOCKED_TITLE}</p>
          <span className="shrink-0 rounded-full border border-zinc-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {TOKO_PRO_LOCKED_BADGE}
          </span>
        </div>
        <p className="mt-1 text-xs font-semibold text-zinc-500">{TOKO_PRO_LOCKED_PRICE}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{TOKO_PRO_LOCKED_DESC}</p>
      </div>
    </div>
  );
}
