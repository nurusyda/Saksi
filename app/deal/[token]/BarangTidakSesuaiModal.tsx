'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  sendBreachReportOtp,
  verifyBreachReportOtpAction,
  fileBarangTidakSesuaiReport,
  type SendOtpState,
  type VerifyOtpState,
  type FileReportState,
} from './breachActions';
import {
  BARANG_TIDAK_SESUAI_PROMPT,
  BARANG_TIDAK_SESUAI_CONSEQUENCES,
  BARANG_TIDAK_SESUAI_SUBMIT_LABEL,
  OTP_STEP_HEADING,
  OTP_SEND_BUTTON_LABEL,
  OTP_RESEND_BUTTON_LABEL,
  OTP_CODE_FIELD_LABEL,
  OTP_CODE_FORMAT_HINT,
  OTP_VERIFY_BUTTON_LABEL,
  PENDING_DEFAULT_LABEL,
} from '@/lib/copy';

// C6 — real report filing (build step 4). Three steps, all gated on the
// reporter's own already-known phone (passed down from PembeliPanel, which
// only renders after IdentifyPartyGate already confirmed this visitor is
// the Pembeli — no phone re-entry needed here):
//   1. Write the note, request an OTP code.
//   2. Enter the code (verifyBreachReportOtpAction).
//   3. Submit (fileBarangTidakSesuaiReport) — only reachable once verified.
// Every step still re-verifies identity server-side independently (see
// breachActions.ts); nothing here is trusted client state.

function StepButton({
  label,
  pendingLabel,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

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
  const [code, setCode] = useState('');

  const boundSendOtp = sendBreachReportOtp.bind(null, token, phone);
  const sendInitialState: SendOtpState = {};
  const [sendState, sendFormAction] = useActionState(boundSendOtp, sendInitialState);

  const boundVerifyOtp = verifyBreachReportOtpAction.bind(null, token, phone);
  const verifyInitialState: VerifyOtpState = {};
  const [verifyState, verifyFormAction] = useActionState(boundVerifyOtp, verifyInitialState);

  const boundFileReport = fileBarangTidakSesuaiReport.bind(null, token, phone);
  const fileInitialState: FileReportState = {};
  const [fileState, fileFormAction] = useActionState(boundFileReport, fileInitialState);

  const otpSent = sendState.sent === true;
  const otpVerified = verifyState.verified === true;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-zinc-900">Barang Tidak Sesuai Kesepakatan</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-zinc-500 hover:text-zinc-800"
          >
            Tutup
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          {itemDesc}
        </div>

        <p className="mb-2 text-sm font-medium text-zinc-700">{BARANG_TIDAK_SESUAI_PROMPT}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={otpSent}
          rows={3}
          className="mb-4 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
        />

        <ul className="mb-4 flex flex-col gap-1.5 text-xs text-zinc-500">
          {BARANG_TIDAK_SESUAI_CONSEQUENCES.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>

        {!otpSent && (
          <form action={sendFormAction} className="flex flex-col gap-3">
            <p className="text-sm text-zinc-700">{OTP_STEP_HEADING}</p>
            {sendState.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {sendState.error}
              </p>
            )}
            {/* Bug found by monster_check: without this guard, sending the
                OTP before typing a note locks the note field (disabled once
                otpSent) while the final submit stays disabled on an empty
                note — a dead end with no way out but closing the modal. */}
            <StepButton
              label={OTP_SEND_BUTTON_LABEL}
              pendingLabel={PENDING_DEFAULT_LABEL}
              disabled={!note.trim()}
            />
          </form>
        )}

        {otpSent && !otpVerified && (
          <div className="flex flex-col gap-3">
            <form action={verifyFormAction} className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700" htmlFor="otp_code">
                  {OTP_CODE_FIELD_LABEL}
                </label>
                <p className="mb-1 text-xs text-zinc-500">{OTP_CODE_FORMAT_HINT}</p>
                <input
                  id="otp_code"
                  name="otp_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              {verifyState.error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {verifyState.error}
                </p>
              )}

              <StepButton label={OTP_VERIFY_BUTTON_LABEL} pendingLabel={PENDING_DEFAULT_LABEL} />
            </form>

            <form action={sendFormAction}>
              <button
                type="submit"
                className="flex h-10 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                {OTP_RESEND_BUTTON_LABEL}
              </button>
            </form>
          </div>
        )}

        {otpVerified && (
          <form action={fileFormAction} className="flex flex-col gap-3">
            <input type="hidden" name="field_note" value={note} />
            {fileState.error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {fileState.error}
              </p>
            )}
            <StepButton
              label={BARANG_TIDAK_SESUAI_SUBMIT_LABEL}
              pendingLabel={PENDING_DEFAULT_LABEL}
              disabled={!note.trim()}
            />
          </form>
        )}
      </div>
    </div>
  );
}
