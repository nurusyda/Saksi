'use client';

import Link from 'next/link';
import { useMyDeals } from '@/lib/sellerDeals';
import { CTA_LIHAT_TAGIHAN_SAYA } from '@/lib/copy';

// §33 — the landing's "Tagihan saya" link, shown only when this device
// actually has tagihan.
//
// Rendering it unconditionally created a loop: a first-time visitor saw two
// buttons, tapped "Tagihan saya", landed on an empty page whose only action
// was "+ Buat Tagihan", and ended up at /buat — the same place the other
// button went. Two CTAs that resolve to one destination, which reads as a
// duplicate rather than a choice.
//
// They are not siblings. /saya is the seller's home and *contains* the create
// button (SAKSI-MASTER.md §5's S1 Beranda); the landing is the explainer for
// someone who does not yet know what this is. So the landing offers exactly
// one thing to a newcomer, and the way back to your list appears only once
// you have a list to go back to.
//
// Renders nothing during SSR (useMyDeals' getServerSnapshot returns []) and
// appears after hydration for a returning seller — useSyncExternalStore is
// built for exactly this, so no hydration mismatch.
export function MyDealsLink() {
  const deals = useMyDeals();
  if (deals.length === 0) return null;

  return (
    <Link
      href="/saya"
      className="flex h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
    >
      {CTA_LIHAT_TAGIHAN_SAYA}
    </Link>
  );
}
