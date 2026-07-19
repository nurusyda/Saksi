'use client';

import { useEffect, useState } from 'react';
import { getDealTimeline, type TimelineEntry } from './paymentActions';
import { formatDateTime } from '@/lib/format';
import { TIMELINE_EVENT_LABELS } from '@/lib/copy';

export function DealTimeline({ token }: { token: string }) {
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);

  useEffect(() => {
    let ignore = false;
    getDealTimeline(token).then((r) => {
      if (!ignore) setEntries(r);
    });
    return () => {
      ignore = true;
    };
  }, [token]);

  if (!entries) return <p className="text-sm text-zinc-500">Memuat riwayat...</p>;

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-zinc-700">{TIMELINE_EVENT_LABELS[e.event] ?? e.event}</span>
          <span className="shrink-0 text-xs text-zinc-400">{formatDateTime(e.created_at)}</span>
        </li>
      ))}
    </ol>
  );
}
