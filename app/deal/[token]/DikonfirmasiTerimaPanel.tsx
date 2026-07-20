'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { identifyParty, confirmFulfillment, type ConfirmActionState } from './paymentActions';
import { DealTimeline } from './DealTimeline';
import { BarangTidakSesuaiModal } from './BarangTidakSesuaiModal';
import type { WhichParty } from '@/lib/db/party';
import {
  CONFIRM_FULFILLMENT_LABEL_JUAL_BELI,
  PENDING_DEFAULT_LABEL,
  SHIP_INSTRUCTION,
  BARANG_TIDAK_SESUAI_BUTTON,
  RIWAYAT_HEADING,
} from '@/lib/copy';

interface DealSummary {
  token: string;
  item_desc: string;
  proposer_role: string;
}

function ConfirmFulfillmentButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_DEFAULT_LABEL : CONFIRM_FULFILLMENT_LABEL_JUAL_BELI}
    </button>
  );
}

function PembeliPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const boundConfirmFulfillment = confirmFulfillment.bind(null, deal.token, phone);
  const initialState: ConfirmActionState = {};
  const [state, formAction] = useActionState(boundConfirmFulfillment, initialState);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={deal.token} />
      </div>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <form action={formAction}>
        <ConfirmFulfillmentButton />
      </form>

      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex h-12 w-full items-center justify-center rounded-lg border border-zinc-300 px-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        {BARANG_TIDAK_SESUAI_BUTTON}
      </button>

      {modalOpen && (
        <BarangTidakSesuaiModal
          token={deal.token}
          phone={phone}
          itemDesc={deal.item_desc}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function PenjualPanel({ deal }: { deal: DealSummary }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        {SHIP_INSTRUCTION}
      </div>
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={deal.token} />
      </div>
    </div>
  );
}

export function DikonfirmasiTerimaPanel({
  deal,
  initialWhichParty,
}: {
  deal: DealSummary;
  initialWhichParty?: WhichParty | null;
}) {
  const boundIdentify = identifyParty.bind(null, deal.token);
  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';

  return (
    <IdentifyPartyGate action={boundIdentify} initialWhichParty={initialWhichParty}>
      {(whichParty, phone) =>
        whichParty === payerSlot ? (
          <PembeliPanel deal={deal} phone={phone} />
        ) : (
          <PenjualPanel deal={deal} />
        )
      }
    </IdentifyPartyGate>
  );
}
