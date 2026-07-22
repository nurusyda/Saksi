'use client';

import { useEffect, useState } from 'react';
import { getDealStatements, type DealStatement } from './paymentActions';
import { formatTimeWib } from '@/lib/format';
import { Card } from '@/components/ui';
import {
  STATEMENT_FROM_PENJUAL_LABEL,
  STATEMENT_FROM_PEMBELI_LABEL,
  STATEMENT_IMAGE_ATTACHED_LABEL,
} from '@/lib/copy';

// §24 (2026-07-21) — shows statements either party has recorded on this
// deal, to the other party. This is the surface that makes the "Dana belum
// masuk / bukti salah" action mean anything: before it existed, the seller's
// side of a disagreement went out over WhatsApp and was gone.
//
// Attributed, timestamped, never adjudicated. The label says who said it,
// the time says when, and nothing here says who is right — both parties'
// accounts are shown the same way. `proposerRole` maps the stored actor
// (PROPOSER/COUNTERPART, a slot) onto the human label (penjual/pembeli).

export function DealStatements({
  token,
  phone,
  proposerRole,
}: {
  token: string;
  phone: string;
  proposerRole: string;
}) {
  const [items, setItems] = useState<DealStatement[] | null>(null);

  useEffect(() => {
    let ignore = false;
    getDealStatements(token, phone)
      .then((r) => {
        if (!ignore) setItems(r);
      })
      .catch(() => {
        if (!ignore) setItems([]);
      });
    return () => {
      ignore = true;
    };
  }, [token, phone]);

  if (!items || items.length === 0) return null;

  const labelFor = (actor: 'PROPOSER' | 'COUNTERPART') => {
    const isPenjual =
      actor === 'PROPOSER' ? proposerRole === 'PENJUAL' : proposerRole !== 'PENJUAL';
    return isPenjual ? STATEMENT_FROM_PENJUAL_LABEL : STATEMENT_FROM_PEMBELI_LABEL;
  };

  return (
    <div className="flex flex-col gap-3">
      {items.map((s, i) => (
        <Card key={i} className="border-muted-amber-line bg-white">
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <p className="text-xs font-bold text-muted-amber">{labelFor(s.actor)}</p>
            <p className="shrink-0 text-[11px] tabular-nums text-zinc-500">
              {formatTimeWib(s.created_at)}
            </p>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{s.body}</p>
          {s.imageUrl && (
            <a
              href={s.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.imageUrl}
                alt={STATEMENT_IMAGE_ATTACHED_LABEL}
                className="max-h-64 w-auto rounded-lg border border-zinc-200 object-contain"
              />
            </a>
          )}
        </Card>
      ))}
    </div>
  );
}
