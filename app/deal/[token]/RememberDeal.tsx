'use client';

import { useEffect } from 'react';
import { rememberDeal } from '@/lib/sellerDeals';

// §32 — records a tagihan into this browser's own list so /saya can find it
// later. Rendered by the deal page only when the viewer is the proposer (the
// `saksi_proposer_${token}` cookie createDeal set), so a buyer opening the
// link never accumulates the seller's deals in their own list.
//
// Runs on the deal page rather than at the end of the create form because
// createDeal redirects server-side: there is no client moment after a
// successful create where the form still exists to record anything. The
// first render of the deal page is that moment.
//
// rememberDeal is idempotent, so re-visiting a deal does not duplicate it,
// and a seller who clears the entry deliberately (SAYA_FORGET_LABEL) will
// see it return if they open the link again while the proposer cookie is
// still valid — acceptable: the cookie means this really is their deal.
export function RememberDeal({
  token,
  itemDesc,
  amountIdr,
}: {
  token: string;
  itemDesc: string;
  amountIdr: number;
}) {
  useEffect(() => {
    rememberDeal({ token, itemDesc, amountIdr, savedAt: new Date().toISOString() });
  }, [token, itemDesc, amountIdr]);

  return null;
}
