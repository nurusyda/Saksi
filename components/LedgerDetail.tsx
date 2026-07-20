'use client';

import { useState } from 'react';
import { formatDate, formatRp, shortHashFragment } from '@/lib/format';
import {
  LEDGER_DETAIL_LINK_LABEL,
  LEDGER_EMPTY_STATE,
  ERROR_LEDGER_UNAVAILABLE,
  formatLedgerRow,
  PENDING_DEFAULT_LABEL,
} from '@/lib/copy';
import type { LedgerResult, LedgerRow } from '@/lib/db/ledger';

// B6/ledger design pass — shared expand-in-place detail panel used by all
// three account-history call sites (app/buat/page.tsx, DisepakatiPanel.tsx,
// CekForm.tsx). Deliberately not a route (see data-model.md's ledger design
// section, "Entry-point mechanism"): this component only ever exists inside
// an already-rendered account-history result, never independently
// reachable. `onFetch` is the caller's own bound server action — this
// component owns no knowledge of which identity (rekening/token/phone) it's
// fetching for.
export function LedgerDetail({ onFetch }: { onFetch: () => Promise<LedgerResult> }) {
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LedgerResult | null>(null);

  async function handleExpand() {
    setExpanded(true);
    setPending(true);
    try {
      setResult(await onFetch());
    } catch {
      // Bug found by monster_check: without this, a thrown rejection left
      // `result` at null with pending already cleared — an empty panel with
      // no explanation, indistinguishable from a genuinely empty ledger.
      setResult({ status: 'error' });
    } finally {
      setPending(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={handleExpand}
        className="self-start text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
      >
        {LEDGER_DETAIL_LINK_LABEL}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
      {pending && <p className="text-zinc-500">{PENDING_DEFAULT_LABEL}</p>}
      {!pending && result?.status === 'error' && <p>{ERROR_LEDGER_UNAVAILABLE}</p>}
      {!pending && result?.status === 'disabled' && null}
      {!pending && result?.status === 'empty' && <p>{LEDGER_EMPTY_STATE}</p>}
      {!pending && result?.status === 'found' && (
        <>
          <ul className="flex flex-col gap-1">
            {result.rows.map((row: LedgerRow, i: number) => (
              <li key={i}>
                {formatLedgerRow(
                  row.bucket,
                  formatDate(row.dateIso),
                  row.itemDesc,
                  formatRp(row.amountIdr),
                  row.counterpartPhoneHash ? shortHashFragment(row.counterpartPhoneHash) : null,
                )}
              </li>
            ))}
          </ul>
          {(result.signals.concentrationLine || result.signals.velocityLine || result.signals.volumeLine) && (
            <ul className="mt-1 flex flex-col gap-1 border-t border-zinc-200 pt-2 text-zinc-500">
              {result.signals.concentrationLine && <li>{result.signals.concentrationLine}</li>}
              {result.signals.velocityLine && <li>{result.signals.velocityLine}</li>}
              {result.signals.volumeLine && <li>{result.signals.volumeLine}</li>}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
