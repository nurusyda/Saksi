import { JoinAndPayForm } from './JoinAndPayForm';
import { RekeningCopyCard } from './RekeningCopyCard';
import { LedgerDetail } from '@/components/LedgerDetail';
import { getDealAccountHistory, getDealLedgerPublic } from './paymentActions';
import { Card } from '@/components/ui';
import {
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  formatAccountHistoryCounts,
  SEND_BUKTI_SECTION_HEADING,
  MONEY_NEVER_TOUCHES_SAKSI_NOTE,
} from '@/lib/copy';
import type { JoinDealState } from './actions';

// §31 — the buyer's page, as one page.
//
// SAKSI-MASTER.md §5's Page 1a is a single screen: invoice, then rekening +
// its record + copy, then bukti upload, with "[ Kirim bukti transfer ]"
// minting the deal event. The record is payment-anchored — nothing is
// recorded until the buyer has actually paid.
//
// What this replaces diverged from that in a way that mattered. The buyer
// hit a phone field first, and the account number only appeared on a later
// screen once they had identified themselves. So the forced check (Law 7)
// happened *after* the decision to trust the seller rather than before it,
// which is backwards for the one thing this product exists to do. The
// account and its record now render immediately, server-side, with no gate,
// and the phone is collected in the same form as the bukti.
//
// The account number is unmasked here. It is the seller's own, published by
// them when they sent this link, and it is what the buyer came for — masking
// it protects nobody and blocks the payment. InvoiceCard's summary row stays
// masked as a glanceable reference; this is the copyable one.
export async function BuyerJoinGate({
  token,
  action,
  rekeningBank,
  rekeningTujuan,
  mode = 'join',
}: {
  token: string;
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
  rekeningBank: string;
  rekeningTujuan: string;
  /** See JoinAndPayForm — 'join' at DRAF, 'pay' once the party exists. */
  mode?: 'join' | 'pay';
}) {
  const history = await getDealAccountHistory(token);

  return (
    <div className="flex flex-col gap-4">
      <RekeningCopyCard bank={rekeningBank} rekening={rekeningTujuan}>
        <p className="text-sm leading-relaxed text-zinc-800">
          {history.status === 'found' &&
            formatAccountHistoryCounts(
              history.selesaiCount,
              history.tidakDipenuhiCount,
              history.sinceLabel,
            )}
          {history.status === 'empty' && FORCED_CHECK_EMPTY_STATE}
          {/* 'idle' means the deal has no rekening set at all — a data
              problem, not a confirmed-clean account. Unreachable today
              (createDeal requires one for PENJUAL, the only proposer role
              since §22) but kept distinct from 'empty' so a regression that
              does reach it fails loud rather than reading as "belum ada
              catatan" on a clean account. */}
          {(history.status === 'error' || history.status === 'idle') &&
            ERROR_ACCOUNT_HISTORY_UNAVAILABLE}
        </p>

        {history.status === 'found' && history.ledgerEnabled && (
          <div className="mt-3">
            {/* .bind, not an inline arrow. This is a Server Component, so a
                closure cannot cross to a Client Component — only a bound
                Server Action serializes. The other three LedgerDetail call
                sites are all client components, where an arrow is fine; this
                is the first server-side one. An arrow here would throw
                "Functions cannot be passed directly to Client Components",
                and would have stayed hidden until LEDGER_DETAIL_ENABLED was
                switched on, since ledgerEnabled gates this branch. */}
            <LedgerDetail onFetch={getDealLedgerPublic.bind(null, token)} />
          </div>
        )}
      </RekeningCopyCard>

      <Card>
        <p className="text-sm font-bold text-zinc-900">{SEND_BUKTI_SECTION_HEADING}</p>
        <p className="mb-4 mt-1 text-xs leading-relaxed text-zinc-500">
          {MONEY_NEVER_TOUCHES_SAKSI_NOTE}
        </p>
        <JoinAndPayForm action={action} mode={mode} />
      </Card>
    </div>
  );
}
