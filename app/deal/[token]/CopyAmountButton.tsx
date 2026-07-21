'use client';

import { useState } from 'react';
import { COPY_AMOUNT_LABEL, COPY_AMOUNT_COPIED_LABEL } from '@/lib/copy';

// §36 — copy the nominal, not just the account number.
//
// The rekening already had a copy button; the amount did not, so the one
// value a buyer had to retype by hand was the one where a typo is both easy
// and expensive. A transposed digit produces a bukti whose nominal does not
// match, which the OCR check flags and the penjual then disputes — an entire
// avoidable dispute created by manual entry.
//
// Copies raw digits with no "Rp" and no thousands separators, because that is
// what a banking app's amount field accepts; pasting "Rp650.000" there fails.
export function CopyAmountButton({ amountIdr }: { amountIdr: number }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(String(amountIdr));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
    >
      {copied ? COPY_AMOUNT_COPIED_LABEL : COPY_AMOUNT_LABEL}
    </button>
  );
}
