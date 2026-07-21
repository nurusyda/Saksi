import { JoinDealForm } from './JoinDealForm';
import { getDealAccountHistory } from './paymentActions';
import { Card } from '@/components/ui';
import {
  JOIN_FORM_HEADING,
  JOIN_DEAL_INSTRUCTION,
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  formatAccountHistoryCounts,
} from '@/lib/copy';
import type { JoinDealState } from './actions';

// §26 (2026-07-21) — the buyer's first screen, merged.
//
// This used to be a screen of its own: the buyer opened a payment link and
// the first thing they saw was a bare phone field, before any of the
// information they came for. The invoice was above it, but the account they
// were about to pay — and that account's record — only appeared on a
// *later* screen, after they had handed over a phone number.
//
// That ordering was backwards for the one thing this product exists to do.
// The forced check (Law 7) is only worth anything if it happens before the
// buyer commits, and "commit" here starts at the moment they decide to
// trust the seller, not at the moment they tap upload. So the destination
// account and its full record are now rendered immediately, server-side,
// with no gate in front of them at all — masked, because this page is
// reachable by anyone holding the link.
//
// The phone field stays, and stays before the *unmasked* number: entering it
// is what records the buyer as a party to this deal, which is the ledger
// entry the whole record depends on. But it is now one section inside the
// page the buyer is already reading, not a wall in front of it.
//
// Found in review (2026-07-21): an earlier version of this card repeated the
// masked account number — InvoiceCard already renders "Rekening tujuan: {bank}
// {masked}" as one of its own rows, directly above this component in the
// render tree. Showing the same masked number a second time, under a heading
// that also read "Rekening tujuan," was exactly the wasted-space problem this
// merge was supposed to fix. This card's only job is the part InvoiceCard
// does not cover — the account's history — so it now leads with that.
export async function BuyerJoinGate({
  token,
  action,
}: {
  token: string;
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
}) {
  const history = await getDealAccountHistory(token);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-400">
          Riwayat rekening ini
        </p>

        <p className="mt-2 text-sm leading-relaxed text-zinc-700">
          {history.status === 'found' &&
            formatAccountHistoryCounts(
              history.selesaiCount,
              history.tidakDipenuhiCount,
              history.sinceLabel,
            )}
          {history.status === 'empty' && FORCED_CHECK_EMPTY_STATE}
          {/* 'idle' means the deal itself has no rekening set — a data
              problem, not a confirmed-clean account. Every reachable DRAF
              deal has one (createDeal requires it for PENJUAL, the only
              proposer role since §22), so this branch is not live today; it
              is kept distinct from 'empty' so a future regression that does
              reach it fails loud instead of quietly reading as "belum ada
              catatan" on a clean account. */}
          {(history.status === 'error' || history.status === 'idle') &&
            ERROR_ACCOUNT_HISTORY_UNAVAILABLE}
        </p>
      </Card>

      <Card>
        <p className="text-sm font-bold text-zinc-900">{JOIN_FORM_HEADING}</p>
        <p className="mb-4 mt-1 text-xs leading-relaxed text-zinc-500">{JOIN_DEAL_INSTRUCTION}</p>
        <JoinDealForm action={action} />
      </Card>
    </div>
  );
}
