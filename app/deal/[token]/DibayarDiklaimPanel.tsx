'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { WaitingStatusPoll } from './WaitingStatusPoll';
import { LiveIndicator } from './LiveIndicator';
import { DealStatus } from '@/lib/db/transitions';
import {
  identifyParty,
  getBuktiForDisplay,
  confirmReceipt,
  notifyPaymentNotReceived,
  type BuktiDisplay,
  type ConfirmActionState,
  type NotifyNotReceivedState,
} from './paymentActions';
import { DeadlineLapseReportModal } from './DeadlineLapseReportModal';
import type { WhichParty } from '@/lib/db/party';
import { getTodayWib } from '@/lib/format';
import {
  formatOcrVerdictLabel,
  PENDING_DEFAULT_LABEL,
  CONFIRM_RECEIPT_LABEL,
  PAYMENT_NOT_RECEIVED_LABEL,
  PAYMENT_NOT_RECEIVED_ACK,
  PAYMENT_NOT_RECEIVED_UNDELIVERED,
  OCR_AUTHENTICITY_DISCLAIMER,
  WAITING_FOR_RECEIPT_CONFIRMATION,
  DEADLINE_LAPSE_REPORT_BUTTON,
  ERROR_BUKTI_LOAD_FAILED,
  REKENING_TUJUAN_LABEL,
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
  item_desc: string;
  deadline: string;
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
      className="flex h-12 w-full items-center justify-center rounded-lg bg-witness px-6 text-sm font-semibold text-white transition-colors hover:bg-witness-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_DEFAULT_LABEL : CONFIRM_RECEIPT_LABEL}
    </button>
  );
}

function NotReceivedButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg border border-muted-amber-line bg-white px-6 text-sm font-medium text-muted-amber transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_DEFAULT_LABEL : PAYMENT_NOT_RECEIVED_LABEL}
    </button>
  );
}

function PenjualReviewPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  const [bukti, setBukti] = useState<BuktiDisplay | null | 'loading' | 'error'>('loading');

  const boundNotifyNotReceived = notifyPaymentNotReceived.bind(null, deal.token, phone);
  const notifyInitialState: NotifyNotReceivedState = {};
  const [notifyState, notifyFormAction] = useActionState(boundNotifyNotReceived, notifyInitialState);

  useEffect(() => {
    let ignore = false;
    getBuktiForDisplay(deal.token, phone)
      .then((r) => {
        if (!ignore) setBukti(r);
      })
      .catch(() => {
        // Bug found by user report: an earlier version had no error state
        // here, so a transient fetch failure (server action network error,
        // etc.) left the Penjual staring at "Memuat bukti..." forever, with
        // both "Konfirmasi uang diterima" and "Dana belum masuk" hidden
        // behind the loading early-return with no escape route. Same class
        // of bug DisepakatiPanel's PaymentForm already guards against for
        // rekening/history loads.
        if (!ignore) setBukti('error');
      });
    return () => {
      ignore = true;
    };
  }, [deal.token, phone]);

  const boundConfirmReceipt = confirmReceipt.bind(null, deal.token, phone);
  const initialState: ConfirmActionState = {};
  const [state, formAction] = useActionState(boundConfirmReceipt, initialState);

  if (bukti === 'error') {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {ERROR_BUKTI_LOAD_FAILED}
      </p>
    );
  }
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
            <FieldMatchRow label={REKENING_TUJUAN_LABEL} match={bukti.ocrResult.rekening_match} />
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

      <form action={notifyFormAction}>
        <NotReceivedButton />
      </form>
      {notifyState.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {notifyState.error}
        </p>
      )}
      {notifyState.sent && <p className="text-xs text-zinc-500">{PAYMENT_NOT_RECEIVED_ACK}</p>}
      {notifyState.undelivered && (
        <p className="text-xs text-zinc-500">{PAYMENT_NOT_RECEIVED_UNDELIVERED}</p>
      )}
    </div>
  );
}

// Pembeli's side while waiting for Penjual to confirm receipt. Adds the
// deadline-lapse report entry point (build step 4 follow-on) once the
// deadline has passed — before that, filing would claim something not yet
// true (breachActions.fileDeadlineLapseReport re-checks this server-side
// regardless; the client-side gate here is purely to not show an action
// that would just bounce with ERROR_DEADLINE_NOT_PASSED).
function PembeliWaitingPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  // Strict `<`, matching breachActions.deadlineHasPassed: the counterpart
  // gets the full calendar day of the deadline itself before this is shown.
  const deadlinePassed = deal.deadline < getTodayWib();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        <LiveIndicator />
        <p>{WAITING_FOR_RECEIPT_CONFIRMATION}</p>
        {/* Paused while the report modal is open — that modal holds an
            in-progress form (DeadlineLapseReportModal), and an unannounced
            router.refresh() mid-typing would be worse than the manual-reload
            friction this component exists to remove. */}
        {!modalOpen && <WaitingStatusPoll token={deal.token} knownStatus={DealStatus.DIBAYAR_DIKLAIM} />}
      </div>

      {deadlinePassed && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-12 w-full items-center justify-center rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          {DEADLINE_LAPSE_REPORT_BUTTON}
        </button>
      )}

      {modalOpen && (
        <DeadlineLapseReportModal
          token={deal.token}
          phone={phone}
          itemDesc={deal.item_desc}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

export function DibayarDiklaimPanel({
  deal,
  initialWhichParty,
}: {
  deal: DealSummary;
  initialWhichParty?: WhichParty | null;
}) {
  const boundIdentify = identifyParty.bind(null, deal.token);
  const payeeSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';

  return (
    <IdentifyPartyGate action={boundIdentify} initialWhichParty={initialWhichParty}>
      {(whichParty, phone) =>
        whichParty === payeeSlot ? (
          <PenjualReviewPanel deal={deal} phone={phone} />
        ) : (
          <PembeliWaitingPanel deal={deal} phone={phone} />
        )
      }
    </IdentifyPartyGate>
  );
}
