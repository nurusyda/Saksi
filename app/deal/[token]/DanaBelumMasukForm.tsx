'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { recordDanaBelumMasuk, type DanaBelumMasukState } from './paymentActions';
import { Card, ErrorBanner, FieldError, buttonClass, inputClass } from '@/components/ui';
import {
  PAYMENT_NOT_RECEIVED_LABEL,
  DANA_BELUM_MASUK_HEADING,
  DANA_BELUM_MASUK_PROMPT,
  DANA_BELUM_MASUK_PLACEHOLDER,
  DANA_BELUM_MASUK_SUBMIT_LABEL,
  DANA_BELUM_MASUK_CONSEQUENCES,
  DANA_BELUM_MASUK_RECORDED,
  PENDING_SAVE_LABEL,
  MODAL_CLOSE_LABEL,
  formatDisputeRoundsLeft,
} from '@/lib/copy';

// §24 (2026-07-21) — the penjual's side of "Dana belum masuk / bukti salah".
//
// Replaces a bare button that fired a WA nudge and reported whether the
// message was delivered. The seller now writes what actually happened and
// that keterangan is recorded against the deal (migration 0029), visible to
// the pembeli. Expanding inline rather than in a modal: the seller is
// looking at the bukti while writing about it, so covering it would be
// backwards.

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={buttonClass.caution}>
      {pending ? PENDING_SAVE_LABEL : DANA_BELUM_MASUK_SUBMIT_LABEL}
    </button>
  );
}

const initialState: DanaBelumMasukState = {};

export function DanaBelumMasukForm({
  token,
  phone,
  roundsLeft,
}: {
  token: string;
  phone: string;
  /** Undefined while the count is still loading, or if the read failed. */
  roundsLeft?: number;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const bound = recordDanaBelumMasuk.bind(null, token, phone);
  const [state, formAction] = useActionState(bound, initialState);

  if (state.recorded) {
    return (
      <Card className="border-muted-amber-line bg-white">
        <p className="text-sm font-semibold text-muted-amber">{DANA_BELUM_MASUK_RECORDED}</p>
      </Card>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass.caution}>
        {PAYMENT_NOT_RECEIVED_LABEL}
      </button>
    );
  }

  return (
    <Card className="border-muted-amber-line">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-zinc-900">{DANA_BELUM_MASUK_HEADING}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900"
        >
          {MODAL_CLOSE_LABEL}
        </button>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-zinc-600">{DANA_BELUM_MASUK_PROMPT}</p>

      <form action={formAction} className="flex flex-col gap-3">
        {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

        <div>
          <textarea
            name="body"
            rows={4}
            maxLength={600}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={DANA_BELUM_MASUK_PLACEHOLDER}
            className={inputClass}
          />
          <p className="mt-1 text-right text-xs text-zinc-400">{body.length}/600</p>
          <FieldError msg={state.fieldError} />
        </div>

        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-zinc-500">
          {DANA_BELUM_MASUK_CONSEQUENCES.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>

        <SubmitButton disabled={body.trim().length < 10} />

        {typeof roundsLeft === 'number' && (
          <p className="text-xs text-zinc-500">{formatDisputeRoundsLeft(roundsLeft)}</p>
        )}
      </form>
    </Card>
  );
}
