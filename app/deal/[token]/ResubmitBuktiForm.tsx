'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { resubmitBukti, type SubmitBuktiState } from './paymentActions';
import { Card, ErrorBanner, buttonClass, inputClass } from '@/components/ui';
import {
  RESUBMIT_BUKTI_HEADING,
  RESUBMIT_BUKTI_PROMPT,
  RESUBMIT_BUKTI_SUBMIT_LABEL,
  BUKTI_ATTESTATION,
  formatDisputeRoundsLeft,
} from '@/lib/copy';

// §30 (2026-07-21) — the pembeli's answer to a "dana belum masuk".
//
// Before this the payment dispute was a dead end: the penjual could state
// that the money never arrived and the pembeli had no way to respond, even
// when the cause was something trivially fixable like the wrong screenshot.
// The forgery attestation is collected again on every re-upload, exactly as
// on the first one — each uploaded file carries its own attestation, and
// re-using the first upload's consent for a different file would be wrong.

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={buttonClass.primary}>
      {pending ? 'Mengunggah...' : RESUBMIT_BUKTI_SUBMIT_LABEL}
    </button>
  );
}

const initialState: SubmitBuktiState = {};

export function ResubmitBuktiForm({
  token,
  phone,
  roundsLeft,
}: {
  token: string;
  phone: string;
  roundsLeft: number;
}) {
  const [attested, setAttested] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const bound = resubmitBukti.bind(null, token, phone);
  const [state, formAction] = useActionState(bound, initialState);

  return (
    <Card className="border-muted-amber-line">
      <p className="text-sm font-bold text-zinc-900">{RESUBMIT_BUKTI_HEADING}</p>
      <p className="mb-4 mt-1 text-xs leading-relaxed text-zinc-600">{RESUBMIT_BUKTI_PROMPT}</p>

      <form action={formAction} className="flex flex-col gap-3">
        {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

        <input
          name="bukti_file"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm`}
        />

        <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-700">
          <input
            type="checkbox"
            name="attest_bukti"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 shrink-0 accent-[var(--witness)]"
          />
          <span>{BUKTI_ATTESTATION}</span>
        </label>

        <SubmitButton disabled={!file || !attested} />

        <p className="text-xs text-zinc-500">{formatDisputeRoundsLeft(roundsLeft)}</p>
      </form>
    </Card>
  );
}
