'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDealStatus } from './paymentActions';

const POLL_INTERVAL_MS = 12000;

/**
 * Headless (renders nothing) — mounted on passive "waiting for the other
 * party" panels to remove the "keep manually reloading to check" friction
 * the UX audit flagged (2026-07-20). Polls getDealStatus(token) — a bare
 * status string, no PII — and calls router.refresh() the moment it differs
 * from the status this panel was rendered for. page.tsx (a Server Component)
 * re-branches on the fresh status on refresh, so the correct next panel
 * swaps in automatically, same outcome as a manual reload, just without
 * requiring one.
 *
 * `knownStatus` is a compile-time constant at every call site (each waiting
 * panel only ever renders for one specific DealStatus), not a value that
 * needs to be threaded down from deal.status — see call sites.
 *
 * Deliberately only mounted on screens with no in-progress user input (the
 * DRAF proposer-wait screen, DISEPAKATI's payee-waiting view, DIBAYAR_
 * DIKLAIM's PembeliWaitingPanel, DIKONFIRMASI_TERIMA's PenjualActionPanel).
 * Screens with an open form (bukti upload, the create form) deliberately do
 * NOT mount this — an unannounced router.refresh() mid-typing would be
 * worse than the manual-reload friction it's meant to remove.
 */
export function WaitingStatusPoll({ token, knownStatus }: { token: string; knownStatus: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => {
      getDealStatus(token).then((s) => {
        if (cancelled || !s || s === knownStatus) return;
        router.refresh();
      });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, knownStatus, router]);

  return null;
}
