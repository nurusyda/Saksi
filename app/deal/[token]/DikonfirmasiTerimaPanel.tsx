'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { WaitingStatusPoll } from './WaitingStatusPoll';
import { LiveIndicator } from './LiveIndicator';
import { identifyParty, confirmFulfillment, type ConfirmActionState } from './paymentActions';
import { DealTimeline } from './DealTimeline';
import { BarangTidakSesuaiModal } from './BarangTidakSesuaiModal';
import type { WhichParty } from '@/lib/db/party';
import { DealStatus } from '@/lib/db/transitions';
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

// Only the role-specific action, not the timeline — DikonfirmasiTerimaPanel
// renders the timeline once, above the identity gate (see below), so these
// two no longer each carry their own copy of it.
function PembeliActionPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const boundConfirmFulfillment = confirmFulfillment.bind(null, deal.token, phone);
  const initialState: ConfirmActionState = {};
  const [state, formAction] = useActionState(boundConfirmFulfillment, initialState);

  return (
    <div className="flex flex-col gap-6">
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

function PenjualActionPanel({ token }: { token: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
      <LiveIndicator />
      <p>{SHIP_INSTRUCTION}</p>
      <WaitingStatusPoll token={token} knownStatus={DealStatus.DIKONFIRMASI_TERIMA} />
    </div>
  );
}

// UX-audit fix pass (2026-07-20): the timeline (getDealTimeline takes only
// the token, no phone — no PII in event/actor/created_at) used to render
// separately inside each of PembeliPanel/PenjualPanel, meaning a visitor
// waiting on IdentifyPartyGate to resolve saw a blank phone-only screen
// first, then a full swap to timeline+action once identified. Since the
// timeline needs no identity to show safely, it's hoisted above the gate
// here and rendered unconditionally — the page is now the same one screen
// throughout: timeline always visible, the role-specific action area fills
// in below it once identity resolves (immediately, on a valid party-session
// or a remembered phone — see IdentifyPartyGate's auto-submit). Deliberately
// NOT applied to the DIBAYAR_DIKLAIM bukti-review screen: the bukti
// image/OCR verdict there *is* PII gated by identity (getBuktiForDisplay),
// so revealing it before identify resolves would defeat the gate rather
// than just skip an empty screen.
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
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={deal.token} />
      </div>

      <IdentifyPartyGate action={boundIdentify} initialWhichParty={initialWhichParty}>
        {(whichParty, phone) =>
          whichParty === payerSlot ? (
            <PembeliActionPanel deal={deal} phone={phone} />
          ) : (
            <PenjualActionPanel token={deal.token} />
          )
        }
      </IdentifyPartyGate>
    </div>
  );
}
