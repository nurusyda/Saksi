'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IdentifyPartyGate } from './IdentifyPartyGate';
import { identifyParty } from './paymentActions';
import {
  getBreachReportNote,
  getHakJawabResponse,
  respondHakJawab,
  type BreachReportNote,
  type HakJawabResponse,
  type RespondHakJawabState,
} from './breachActions';
import { DealTimeline } from './DealTimeline';
import type { WhichParty } from '@/lib/db/party';
import { DealStatus } from '@/lib/db/transitions';
import {
  TIDAK_DIPENUHI_REPORTER_WAITING,
  TIDAK_DIPENUHI_FLAGGED_HEADING,
  TIDAK_DIPENUHI_FIELD_NOTE_LABEL,
  HAK_JAWAB_NOTE_LABEL,
  HAK_JAWAB_EVIDENCE_LABEL,
  HAK_JAWAB_EVIDENCE_HINT,
  HAK_JAWAB_EVIDENCE_LINK_LABEL,
  HAK_JAWAB_SUBMIT_LABEL,
  SENGKETA_STATUS_LINE,
  PENDING_DEFAULT_LABEL,
  RIWAYAT_HEADING,
} from '@/lib/copy';

// Build step 4 follow-on — bare-bones TIDAK_DIPENUHI/SENGKETA screens.
// Reachable once fileBarangTidakSesuaiReport (BarangTidakSesuaiModal) files
// a report. Out of scope for this pass: an auto-publish sweep for silent
// windows and the public check/flag page — see breachActions.ts/migration
// 0020 header comments.

interface DealSummary {
  token: string;
  item_desc: string;
  proposer_role: string;
  status: string;
}

function RespondButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_DEFAULT_LABEL : HAK_JAWAB_SUBMIT_LABEL}
    </button>
  );
}

function ReportNoteCard({ token, phone }: { token: string; phone: string }) {
  const [note, setNote] = useState<BreachReportNote | null | 'loading'>('loading');

  useEffect(() => {
    let ignore = false;
    getBreachReportNote(token, phone)
      .then((r) => {
        if (!ignore) setNote(r);
      })
      .catch(() => {
        if (!ignore) setNote(null);
      });
    return () => {
      ignore = true;
    };
  }, [token, phone]);

  // note.fieldNote can be an empty string: the deadline-lapse entry point
  // (breachActions.fileDeadlineLapseReport) makes the note optional, unlike
  // C6's barang-tidak-sesuai path, which requires one. An empty-but-present
  // breach_notes row would otherwise render a label with nothing under it.
  if (note === 'loading' || !note || !note.fieldNote.trim()) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {TIDAK_DIPENUHI_FIELD_NOTE_LABEL}
      </p>
      <p className="text-sm text-zinc-700">{note.fieldNote}</p>
    </div>
  );
}

function SengketaResponseCard({ token, phone }: { token: string; phone: string }) {
  const [resp, setResp] = useState<HakJawabResponse | null | 'loading'>('loading');

  useEffect(() => {
    let ignore = false;
    getHakJawabResponse(token, phone)
      .then((r) => {
        if (!ignore) setResp(r);
      })
      .catch(() => {
        if (!ignore) setResp(null);
      });
    return () => {
      ignore = true;
    };
  }, [token, phone]);

  if (resp === 'loading' || !resp) return null;

  return (
    <div className="rounded-xl border border-zinc-200 p-5">
      <p className="text-sm font-medium text-zinc-900">{SENGKETA_STATUS_LINE}</p>
      {resp.responseNote && <p className="mt-2 text-sm text-zinc-700">{resp.responseNote}</p>}
      {resp.evidenceSignedUrl && (
        <a
          href={resp.evidenceSignedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-sm text-zinc-700 underline"
        >
          {HAK_JAWAB_EVIDENCE_LINK_LABEL}
        </a>
      )}
    </div>
  );
}

function FlaggedPartyPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  const [responseNote, setResponseNote] = useState('');
  const boundRespond = respondHakJawab.bind(null, deal.token, phone);
  const initialState: RespondHakJawabState = {};
  const [state, formAction] = useActionState(boundRespond, initialState);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm font-medium text-zinc-900">{TIDAK_DIPENUHI_FLAGGED_HEADING}</p>
      <ReportNoteCard token={deal.token} phone={phone} />

      {deal.status === DealStatus.TIDAK_DIPENUHI && (
        <form action={formAction} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-5">
          {state.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.error}
            </p>
          )}
          <label className="block text-sm font-medium text-zinc-700" htmlFor="response_note">
            {HAK_JAWAB_NOTE_LABEL}
          </label>
          <textarea
            id="response_note"
            name="response_note"
            value={responseNote}
            onChange={(e) => setResponseNote(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="evidence_file">
              {HAK_JAWAB_EVIDENCE_LABEL}
            </label>
            <p className="mb-1 text-xs text-zinc-500">{HAK_JAWAB_EVIDENCE_HINT}</p>
            <input
              id="evidence_file"
              name="evidence_file"
              type="file"
              accept="image/*,application/pdf"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <RespondButton />
        </form>
      )}

      {deal.status === DealStatus.SENGKETA && <SengketaResponseCard token={deal.token} phone={phone} />}

      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={deal.token} />
      </div>
    </div>
  );
}

function ReporterPanel({ deal, phone }: { deal: DealSummary; phone: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
        {deal.status === DealStatus.SENGKETA ? SENGKETA_STATUS_LINE : TIDAK_DIPENUHI_REPORTER_WAITING}
      </div>
      <ReportNoteCard token={deal.token} phone={phone} />
      {deal.status === DealStatus.SENGKETA && <SengketaResponseCard token={deal.token} phone={phone} />}
      <div className="rounded-xl border border-zinc-200 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">{RIWAYAT_HEADING}</p>
        <DealTimeline token={deal.token} />
      </div>
    </div>
  );
}

export function TidakDipenuhiPanel({
  deal,
  initialWhichParty,
}: {
  deal: DealSummary;
  initialWhichParty?: WhichParty | null;
}) {
  const boundIdentify = identifyParty.bind(null, deal.token);
  const flaggedSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';

  return (
    <IdentifyPartyGate action={boundIdentify} initialWhichParty={initialWhichParty}>
      {(whichParty, phone) =>
        whichParty === flaggedSlot ? (
          <FlaggedPartyPanel deal={deal} phone={phone} />
        ) : (
          <ReporterPanel deal={deal} phone={phone} />
        )
      }
    </IdentifyPartyGate>
  );
}
