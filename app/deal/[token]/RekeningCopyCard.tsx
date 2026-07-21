'use client';

import { useState } from 'react';
import {
  COPY_REKENING_ENABLED_LABEL,
  COPY_REKENING_COPIED_LABEL,
  REKENING_TUJUAN_LABEL,
} from '@/lib/copy';

// §31 — the destination account, shown in full, with a copy button.
//
// Law 7 (the forced check) is satisfied structurally rather than by a
// disabled button: the account's record is server-rendered directly above
// this card, so it is on screen before the number can be copied. The old
// "disable the button until an async history fetch resolves" mechanic
// existed because the history was fetched client-side after mount; with it
// rendered server-side there is no window in which the button could be
// pressed before the record is visible. The check got stricter, not weaker.
//
// `rekening` is the seller's own account number, which they published by
// sending this link — it is the one thing the buyer came here to get. It is
// unmasked here (unlike InvoiceCard's summary row, which stays masked as a
// glanceable reference) because a number the buyer cannot read is a number
// they cannot pay into.
export function RekeningCopyCard({
  bank,
  rekening,
  children,
}: {
  bank: string;
  rekening: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(rekening);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-2.5 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          {REKENING_TUJUAN_LABEL}
        </p>
      </div>

      <div className="px-4 py-3.5 sm:px-5">
        <p className="text-xs font-semibold text-zinc-500">{bank}</p>
        <p className="mt-0.5 break-all text-xl font-extrabold tracking-tight text-zinc-900">
          {rekening}
        </p>

        {/* The account's record — server-rendered by the parent, passed in
            as children so it sits inside this card rather than floating
            beside it. On screen before the copy button, by construction. */}
        <div className="mt-3 border-t border-zinc-100 pt-3">{children}</div>

        <button type="button" onClick={copy} className={`mt-3 ${copyButtonClass}`}>
          {copied ? COPY_REKENING_COPIED_LABEL : COPY_REKENING_ENABLED_LABEL}
        </button>
      </div>
    </div>
  );
}

const copyButtonClass =
  'flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50';
