'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { WaitingStatusPoll } from './WaitingStatusPoll';
import { DealStatus } from '@/lib/db/transitions';
import {
  identifyParty,
  getDealAccountHistory,
  getRekeningForPayer,
  submitBukti,
  getDealLedger,
  type AccountHistoryDisplay,
  type RekeningForPayer,
  type SubmitBuktiState,
} from './paymentActions';
import type { WhichParty } from '@/lib/db/party';
import { LedgerDetail } from '@/components/LedgerDetail';
import { RekeningCopyCard } from './RekeningCopyCard';
import {
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  formatAccountHistoryCounts,
  BUKTI_ATTESTATION,
  WAITING_FOR_PAYMENT_PROOF,
  ERROR_REKENING_LOAD_FAILED,
} from '@/lib/copy';

interface DealSummary {
  token: string;
  item_desc: string;
  amount_idr: number;
  proposer_role: string;
}

function SubmitBuktiButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-witness px-6 text-sm font-semibold text-white transition-colors hover:bg-witness-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? 'Mengunggah...' : 'Kirim bukti transfer'}
    </button>
  );
}

function PaymentForm({ deal, phone }: { deal: DealSummary; phone: string }) {
  // Fetched only after IdentifyPartyGate has already confirmed this visitor
  // is the payer — never passed down as a prop from the server component
  // (that was the leak monster_check found: props to a client component are
  // serialized into the initial payload regardless of client-side gating).
  const [rekening, setRekening] = useState<RekeningForPayer | 'loading' | 'error'>('loading');
  const [history, setHistory] = useState<AccountHistoryDisplay>({ status: 'idle' });
  const [attested, setAttested] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let ignore = false;
    getRekeningForPayer(deal.token, phone)
      .then((r) => {
        if (!ignore) setRekening(r ?? 'error');
      })
      .catch(() => {
        if (!ignore) setRekening('error');
      });
    return () => {
      ignore = true;
    };
  }, [deal.token, phone]);

  useEffect(() => {
    let ignore = false;
    getDealAccountHistory(deal.token).then((r) => {
      if (!ignore) setHistory(r);
    });
    return () => {
      ignore = true;
    };
  }, [deal.token]);

  const boundSubmitBukti = submitBukti.bind(null, deal.token, phone);
  const initialState: SubmitBuktiState = {};
  const [state, formAction] = useActionState(boundSubmitBukti, initialState);

  // Bug found by monster_check: an earlier version had no error state here,
  // so a rate-limited or otherwise-failed lookup left the payer staring at
  // an indefinite "loading" message with no escape route.
  if (rekening === 'error') {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {ERROR_REKENING_LOAD_FAILED}
      </p>
    );
  }
  if (rekening === 'loading') {
    return <p className="text-sm text-zinc-500">Memuat rekening tujuan...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* §36 — the same RekeningCopyCard the merged buyer page uses. This
          screen is where a buyer lands if the one-shot join+pay could not
          complete the payment claim, so it has to read as the same page
          continuing, not a different second form asking for the same thing.
          The only difference is the phone field, which is gone because the
          buyer is already identified by this point. */}
      <RekeningCopyCard bank={rekening.rekeningBank} rekening={rekening.rekeningTujuan}>
        <p className="text-sm leading-relaxed text-zinc-800" aria-live="polite">
          {history.status === 'idle' && 'Memeriksa riwayat rekening...'}
          {history.status === 'found' &&
            formatAccountHistoryCounts(
              history.selesaiCount,
              history.tidakDipenuhiCount,
              history.sinceLabel,
            )}
          {history.status === 'empty' && FORCED_CHECK_EMPTY_STATE}
          {history.status === 'error' && ERROR_ACCOUNT_HISTORY_UNAVAILABLE}
        </p>

        {history.status === 'found' && history.ledgerEnabled && (
          <div className="mt-3">
            <LedgerDetail onFetch={() => getDealLedger(deal.token, phone)} />
          </div>
        )}
      </RekeningCopyCard>

      <form action={formAction} className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-5">
        {state.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-700" htmlFor="bukti_file">
            Bukti transfer
          </label>
          <input
            id="bukti_file"
            name="bukti_file"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="attest_bukti"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>{BUKTI_ATTESTATION}</span>
        </label>

        <SubmitBuktiButton disabled={!file || !attested} />
      </form>
    </div>
  );
}

export function DisepakatiPanel({
  deal,
  initialWhichParty,
}: {
  deal: DealSummary;
  initialWhichParty?: WhichParty | null;
}) {
  const boundIdentify = identifyParty.bind(null, deal.token);
  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';

  return (
    <div className="flex flex-col gap-6">
      {/* copy-id.md §21: the item/amount summary this used to repeat here is
          already shown once, above this panel, by page.tsx's top-level
          summary card (every status renders it). Removing the duplicate
          means a freshly-joined payer's IdentifyPartyGate short-circuit
          lands directly on PaymentForm — rekening/history/copy/bukti,
          nothing else above it. */}
      <IdentifyPartyGate action={boundIdentify} initialWhichParty={initialWhichParty}>
        {(whichParty, phone) =>
          whichParty === payerSlot ? (
            <PaymentForm deal={deal} phone={phone} />
          ) : (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
              <p>{WAITING_FOR_PAYMENT_PROOF}</p>
              <WaitingStatusPoll token={deal.token} knownStatus={DealStatus.DISEPAKATI} />
            </div>
          )
        }
      </IdentifyPartyGate>
    </div>
  );
}
