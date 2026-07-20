'use client';

import { useActionState, useState } from 'react';
import {
  sendDeadlineLapseOtp,
  verifyDeadlineLapseOtpAction,
  fileDeadlineLapseReport,
  type SendOtpState,
  type VerifyOtpState,
  type FileReportState,
} from './breachActions';
import { StepButton } from './StepButton';
import {
  DEADLINE_LAPSE_PROMPT,
  DEADLINE_LAPSE_MODAL_HEADING,
  MODAL_CLOSE_LABEL,
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

// Build step 4 follow-on — the DIBAYAR_DIKLAIM "ghost seller" entry point
// into the breach path. Mirrors BarangTidakSesuaiModal's structure exactly
// (same three-step OTP flow, same server-verified identity at every step —
// nothing here is trusted client state); the two differences are the
// prompt/heading framing and that the note is optional (no goods-mismatch
// claim to describe, so submit isn't gated on non-empty text). The
// consequences list and submit label are reused verbatim from the C6
// constants — their content is already state-agnostic.

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
  const [code, setCode] = useState('');

  const boundSendOtp = sendDeadlineLapseOtp.bind(null, token, phone);
  const sendInitialState: SendOtpState = {};
  const [sendState, sendFormAction] = useActionState(boundSendOtp, sendInitialState);

  const boundVerifyOtp = verifyDeadlineLapseOtpAction.bind(null, token, phone);
  const verifyInitialState: VerifyOtpState = {};
  const [verifyState, verifyFormAction] = useActionState(boundVerifyOtp, verifyInitialState);

  const boundFileReport = fileDeadlineLapseReport.bind(null, token, phone);
  const fileInitialState: FileReportState = {};
  const [fileState, fileFormAction] = useActionState(boundFileReport, fileInitialState);

  const otpSent = sendState.sent === true;
  const otpVerified = verifyState.verified === true;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-zinc-900">{DEADLINE_LAPSE_MODAL_HEADING}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-zinc-500 hover:text-zinc-800"
          >
            {MODAL_CLOSE_LABEL}
          </button>
        </div>

        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          {itemDesc}
        </div>

        <p className="mb-2 text-sm font-medium text-zinc-700">{DEADLINE_LAPSE_PROMPT}</p>
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
            <StepButton label={OTP_SEND_BUTTON_LABEL} pendingLabel={PENDING_DEFAULT_LABEL} />
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
            <StepButton label={BARANG_TIDAK_SESUAI_SUBMIT_LABEL} pendingLabel={PENDING_DEFAULT_LABEL} />
          </form>
        )}
      </div>
    </div>
  );
}
