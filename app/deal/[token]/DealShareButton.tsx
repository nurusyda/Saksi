'use client';

import { useState } from 'react';

export function DealShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
    >
      {copied ? 'Tersalin!' : 'Salin'}
    </button>
  );
}
