'use client';

import { useActionState, useState } from 'react';
import { fileDeadlineLapseReport, type FileReportState } from './breachActions';
import { StepButton } from './StepButton';
import { ErrorBanner, inputClass } from '@/components/ui';
import {
  DEADLINE_LAPSE_PROMPT,
  DEADLINE_LAPSE_MODAL_HEADING,
  MODAL_CLOSE_LABEL,
  BARANG_TIDAK_SESUAI_CONSEQUENCES,
  BARANG_TIDAK_SESUAI_SUBMIT_LABEL,
  PENDING_DEFAULT_LABEL,
} from '@/lib/copy';

// The DIBAYAR_DIKLAIM "ghost seller" entry point into the breach path.
// Mirrors BarangTidakSesuaiModal exactly; the two differences are the
// prompt/heading framing and that the note is optional here (there is no
// goods-mismatch claim to describe, so submit is not gated on non-empty
// text). Consequences list and submit label are reused verbatim from the C6
// constants — their content is already state-agnostic.
//
// §25 (2026-07-21): OTP step removed, same as its sibling. See that file's
// header for the reasoning; the short version is that gating the wronged
// party's only recourse on a WhatsApp delivery was the wrong failure mode.

export function DeadlineLapseReportModal({
  token,
  phone,
  itemDesc,
  onClose,
}: {
  token: string;
  phone: string;
  itemDesc: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');

  const boundFileReport = fileDeadlineLapseReport.bind(null, token, phone);
  const fileInitialState: FileReportState = {};
  const [fileState, fileFormAction] = useActionState(boundFileReport, fileInitialState);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-bold text-zinc-900">{DEADLINE_LAPSE_MODAL_HEADING}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            {MODAL_CLOSE_LABEL}
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          {itemDesc}
        </div>

        <form action={fileFormAction} className="flex flex-col gap-3">
          <div>
            <p className="mb-2 text-sm font-semibold text-zinc-800">{DEADLINE_LAPSE_PROMPT}</p>
            <textarea
              name="field_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={600}
              className={inputClass}
            />
            <p className="mt-1 text-right text-xs text-zinc-400">{note.length}/600</p>
          </div>

          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed text-zinc-500">
            {BARANG_TIDAK_SESUAI_CONSEQUENCES.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          {fileState.error && <ErrorBanner>{fileState.error}</ErrorBanner>}

          <StepButton
            label={BARANG_TIDAK_SESUAI_SUBMIT_LABEL}
            pendingLabel={PENDING_DEFAULT_LABEL}
          />
        </form>
      </div>
    </div>
  );
}
