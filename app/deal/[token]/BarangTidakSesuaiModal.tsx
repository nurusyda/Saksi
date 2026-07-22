'use client';

import { useActionState, useState } from 'react';
import { fileBarangTidakSesuaiReport, type FileReportState } from './breachActions';
import { StepButton } from './StepButton';
import { ErrorBanner, inputClass } from '@/components/ui';
import {
  BARANG_TIDAK_SESUAI_PROMPT,
  BARANG_TIDAK_SESUAI_CONSEQUENCES,
  BARANG_TIDAK_SESUAI_SUBMIT_LABEL,
  BARANG_TIDAK_SESUAI_MODAL_HEADING,
  MODAL_CLOSE_LABEL,
  PENDING_DEFAULT_LABEL,
  STATEMENT_IMAGE_FIELD_LABEL,
  STATEMENT_IMAGE_ATTESTATION,
} from '@/lib/copy';

// C6 — report filing.
//
// §25 (2026-07-21): the OTP step is gone. This was three steps (write note →
// request WA code → enter code → submit); it is now one. The OTP existed to
// let the flag text claim the reporter's phone was verified, but it sat on
// the WhatsApp channel, so when that channel was unavailable the report
// could not be filed at all — a buyer with a real complaint was blocked from
// recording it by an outage in a notification integration. Blocking the
// wronged party's only recourse is the worst possible failure mode here.
//
// Identity is still checked, just not by OTP: `phone` comes from
// PembeliPanel, which only renders after IdentifyPartyGate confirmed this
// visitor is a party to this deal, and breachActions.ts independently
// re-derives the party from that phone server-side on submit. What is lost
// is proof of *possession* of the number — so the consequences list no
// longer claims the reporter's phone is verified. See copy-id.md §25.

export function BarangTidakSesuaiModal({
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
  const [hasImage, setHasImage] = useState(false);
  const [attested, setAttested] = useState(false);

  const boundFileReport = fileBarangTidakSesuaiReport.bind(null, token, phone);
  const fileInitialState: FileReportState = {};
  const [fileState, fileFormAction] = useActionState(boundFileReport, fileInitialState);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-bold text-zinc-900">{BARANG_TIDAK_SESUAI_MODAL_HEADING}</h2>
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
            <p className="mb-2 text-sm font-semibold text-zinc-800">{BARANG_TIDAK_SESUAI_PROMPT}</p>
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

          <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
            {STATEMENT_IMAGE_FIELD_LABEL}
            <input
              name="evidence_file"
              type="file"
              accept="image/*"
              onChange={(e) => setHasImage((e.target.files?.[0]?.size ?? 0) > 0)}
              className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm`}
            />
          </label>

          {hasImage && (
            <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-700">
              <input
                type="checkbox"
                name="attest_image"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5 shrink-0 accent-[var(--witness)]"
              />
              <span>{STATEMENT_IMAGE_ATTESTATION}</span>
            </label>
          )}

          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-xs leading-relaxed text-zinc-500">
            {BARANG_TIDAK_SESUAI_CONSEQUENCES.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>

          {fileState.error && <ErrorBanner>{fileState.error}</ErrorBanner>}

          <StepButton
            label={BARANG_TIDAK_SESUAI_SUBMIT_LABEL}
            pendingLabel={PENDING_DEFAULT_LABEL}
            disabled={!note.trim() || (hasImage && !attested)}
          />
        </form>
      </div>
    </div>
  );
}
