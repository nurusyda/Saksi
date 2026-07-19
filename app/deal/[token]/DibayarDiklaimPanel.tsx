'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { identifyParty, getBuktiForDisplay, confirmReceipt, type BuktiDisplay, type ConfirmActionState } from './paymentActions';
import type { WhichParty } from '@/lib/db/party';
import {
  formatOcrVerdictLabel,
  PENDING_DEFAULT_LABEL,
  CONFIRM_RECEIPT_LABEL,
  PAYMENT_NOT_RECEIVED_LABEL,
  OCR_AUTHENTICITY_DISCLAIMER,
  WAITING_FOR_RECEIPT_CONFIRMATION,
} from '@/lib/copy';

// TIDAK_KONSISTEN interpolates the actual mismatched field names (copy-id.md
// §5's [field yang berbeda] marker) — date_ok is excluded to match
// checkBuktiConsistency's own mismatch signal (lib/ocr/gemini.ts), which
// treats the transfer date as informational only, not a consistency check.
const MISMATCH_FIELD_LABELS: Record<'amount_match' | 'rekening_match' | 'bank_match', string> = {
  amount_match: 'nominal',
  rekening_match: 'rekening tujuan',
  bank_match: 'bank',
};

function getMismatchedFields(ocrResult: BuktiDisplay['ocrResult']): string[] {
  if (!ocrResult) return [];
  return (Object.keys(MISMATCH_FIELD_LABELS) as (keyof typeof MISMATCH_FIELD_LABELS)[])
    .filter((k) => ocrResult[k] === false)
    .map((k) => MISMATCH_FIELD_LABELS[k]);
}

interface DealSummary {
  token: string;
  proposer_role: string;
}

function FieldMatchRow({ label, match }: { label: string; match: boolean | null }) {
  const text = match === null ? 'Tidak terbaca' : match ? 'Cocok' : 'Tidak cocok';
  const color = match === null ? 'text-zinc-500' : match ? 'text-green-700' : 'text-red-600';
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm last:border-0">
      <span className="text-zinc-600">{label}</span>
      <span className={`font-medium ${color}`}>{text}</span>
    </div>
  );
}

function ConfirmReceiptButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_DEFAULT_LABEL : CONFIRM_RECEIPT_LABEL}
    </button>
  );
}

function PenjualReviewPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  const [bukti, setBukti] = useState<BuktiDisplay | null | 'loading'>('loading');
  // C4 — "Dana belum masuk" is Option A: no state change, no notification,
  // no RPC call. Purely a local acknowledgment so the Penjual isn't left
  // wondering whether the tap registered.
  const [notReceivedAck, setNotReceivedAck] = useState(false);

  useEffect(() => {
    let ignore = false;
    getBuktiForDisplay(deal.token, phone).then((r) => {
      if (!ignore) setBukti(r);
    });
    return () => {
      ignore = true;
    };
  }, [deal.token, phone]);

  const boundConfirmReceipt = confirmReceipt.bind(null, deal.token, phone);
  const initialState: ConfirmActionState = {};
  const [state, formAction] = useActionState(boundConfirmReceipt, initialState);

  if (bukti === 'loading') {
    return <p className="text-sm text-zinc-500">Memuat bukti...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 p-5">
        {bukti?.signedUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bukti.signedUrl}
            alt="Bukti transfer"
            className="mb-4 max-h-96 w-full rounded-lg border border-zinc-200 object-contain"
          />
        )}

        {bukti?.ocrVerdict && (
          <p className="mb-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            {formatOcrVerdictLabel(bukti.ocrVerdict, getMismatchedFields(bukti.ocrResult))}
          </p>
        )}

        {bukti?.ocrResult && (
          <div className="mb-4">
            <FieldMatchRow label="Nominal" match={bukti.ocrResult.amount_match} />
            <FieldMatchRow label="Tanggal" match={bukti.ocrResult.date_ok} />
            <FieldMatchRow label="Rekening tujuan" match={bukti.ocrResult.rekening_match} />
            <FieldMatchRow label="Bank" match={bukti.ocrResult.bank_match} />
          </div>
        )}

        <p className="text-xs text-zinc-500">{OCR_AUTHENTICITY_DISCLAIMER}</p>
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <ConfirmReceiptButton />
      </form>

      <button
        type="button"
        onClick={() => setNotReceivedAck(true)}
        className="flex h-12 w-full items-center justify-center rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        {PAYMENT_NOT_RECEIVED_LABEL}
      </button>
      {notReceivedAck && (
        <p className="text-xs text-zinc-500">Dicatat. Kesepakatan tetap berjalan; periksa kembali secara berkala.</p>
      )}
    </div>
  );
}

export function DibayarDiklaimPanel({ deal }: { deal: DealSummary }) {
  const boundIdentify = identifyParty.bind(null, deal.token);
  const payeeSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';

  return (
    <IdentifyPartyGate action={boundIdentify}>
      {(whichParty, phone) =>
        whichParty === payeeSlot ? (
          <PenjualReviewPanel deal={deal} phone={phone} />
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
            {WAITING_FOR_RECEIPT_CONFIRMATION}
          </div>
        )
      }
    </IdentifyPartyGate>
  );
}
