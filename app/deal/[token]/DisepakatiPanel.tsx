'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { WaitingStatusPoll } from './WaitingStatusPoll';
import { LiveIndicator } from './LiveIndicator';
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
import {
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  formatAccountHistory,
  COPY_REKENING_DISABLED_LABEL,
  COPY_REKENING_ENABLED_LABEL,
  COPY_REKENING_COPIED_LABEL,
  BUKTI_ATTESTATION,
  WAITING_FOR_PAYMENT_PROOF,
  ERROR_REKENING_LOAD_FAILED,
  REKENING_TUJUAN_LABEL,
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
  // Bug found by monster_check: an earlier version stored the button label
  // itself in state, seeded to the disabled-state label and only advanced
  // on the user's own click — so it stayed on "disabled" even after the
  // history resolved, backwards from copy-id.md §2's disabled -> enabled
  // contract. Fixed by deriving the label from render state below instead
  // of syncing it via an effect (justCopied is the only thing that's
  // actually transient here).
  const [justCopied, setJustCopied] = useState(false);
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

  // Bug found by monster_check: 'error' counted as "resolved," so a
  // transient lookup failure unlocked the copy button with the payer never
  // having actually seen any history — exactly the technical-failure
  // bypass the ERROR_ACCOUNT_HISTORY_UNAVAILABLE comment in lib/copy.ts
  // already warns against for the empty-state line. The forced-check
  // guard must stay locked on error too, not just show the error text.
  const historyResolved = history.status === 'found' || history.status === 'empty';
  const copyButtonState = !historyResolved ? 'idle' : justCopied ? 'copied' : 'ready';
  const copyLabel = {
    idle: COPY_REKENING_DISABLED_LABEL,
    copied: COPY_REKENING_COPIED_LABEL,
    ready: COPY_REKENING_ENABLED_LABEL,
  }[copyButtonState];

  const copyRekening = () => {
    if (!historyResolved || rekening === 'loading' || rekening === 'error') return;
    void navigator.clipboard.writeText(rekening.rekeningTujuan);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1500);
  };

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
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-1 text-sm font-medium text-zinc-700">{REKENING_TUJUAN_LABEL}</p>
        <p className="mb-3 text-base font-medium text-zinc-900">
          {rekening.rekeningBank} {rekening.rekeningTujuan}
        </p>

        <p className="mb-3 text-xs text-zinc-500" aria-live="polite">
          {history.status === 'idle' && 'Memeriksa riwayat rekening...'}
          {history.status === 'found' &&
            formatAccountHistory(
              rekening.rekeningBank,
              history.rekeningMasked,
              history.selesaiCount,
              history.tidakDipenuhiCount,
              history.sinceLabel,
            )}
          {history.status === 'empty' && FORCED_CHECK_EMPTY_STATE}
          {history.status === 'error' && ERROR_ACCOUNT_HISTORY_UNAVAILABLE}
        </p>

        {history.status === 'found' && history.ledgerEnabled && (
          <div className="mb-3">
            <LedgerDetail onFetch={() => getDealLedger(deal.token, phone)} />
          </div>
        )}

        <button
          type="button"
          onClick={copyRekening}
          disabled={!historyResolved}
          className="flex h-10 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copyLabel}
        </button>
      </div>

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
              <LiveIndicator />
              <p>{WAITING_FOR_PAYMENT_PROOF}</p>
              <WaitingStatusPoll token={deal.token} knownStatus={DealStatus.DISEPAKATI} />
            </div>
          )
        }
      </IdentifyPartyGate>
    </div>
  );
}
