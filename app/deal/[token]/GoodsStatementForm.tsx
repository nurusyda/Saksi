'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { recordBarangTidakSesuai, recordPenjualJawab, type DanaBelumMasukState } from './paymentActions';
import { Card, ErrorBanner, FieldError, PendingContent, buttonClass, inputClass } from '@/components/ui';
import {
  BARANG_TIDAK_SESUAI_CLAIM_HEADING,
  BARANG_TIDAK_SESUAI_CLAIM_PROMPT,
  BARANG_TIDAK_SESUAI_CLAIM_PLACEHOLDER,
  BARANG_TIDAK_SESUAI_CLAIM_SUBMIT,
  PENJUAL_JAWAB_HEADING,
  PENJUAL_JAWAB_PROMPT,
  PENJUAL_JAWAB_PLACEHOLDER,
  PENJUAL_JAWAB_SUBMIT,
  GOODS_DISPUTE_CONSEQUENCES,
  DANA_BELUM_MASUK_RECORDED,
  PENDING_SAVE_LABEL,
  MODAL_CLOSE_LABEL,
  STATEMENT_IMAGE_FIELD_LABEL,
  STATEMENT_IMAGE_ATTESTATION,
  formatDisputeRoundsLeft,
} from '@/lib/copy';

// §42 — the goods clarification loop, both sides.
//
// One component, two roles: the buyer opens a round ("this is not what I
// ordered"), the seller answers one that is open. Same shape as the payment
// loop's DanaBelumMasukForm, deliberately — a party who has been through one
// dispute should recognise the other immediately.
//
// The buyer's version expands from a button (it is an action they choose);
// the seller's renders open (it is a question they have been asked).

function SubmitButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={buttonClass.caution}>
      {pending ? <PendingContent label={PENDING_SAVE_LABEL} /> : label}
    </button>
  );
}

const initialState: DanaBelumMasukState = {};

export function GoodsStatementForm({
  token,
  phone,
  side,
  roundsLeft,
}: {
  token: string;
  phone: string;
  side: 'buyer' | 'seller';
  roundsLeft?: number;
}) {
  const isBuyer = side === 'buyer';
  // The seller is answering a claim already on the record, so the form is
  // open from the start; the buyer is choosing to raise one, so it is behind
  // a button.
  const [open, setOpen] = useState(!isBuyer);
  const [body, setBody] = useState('');
  const [hasImage, setHasImage] = useState(false);
  const [attested, setAttested] = useState(false);

  const action = isBuyer ? recordBarangTidakSesuai : recordPenjualJawab;
  const bound = action.bind(null, token, phone);
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
        {BARANG_TIDAK_SESUAI_CLAIM_HEADING}
      </button>
    );
  }

  return (
    <Card className="border-muted-amber-line">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-zinc-900">
          {isBuyer ? BARANG_TIDAK_SESUAI_CLAIM_HEADING : PENJUAL_JAWAB_HEADING}
        </p>
        {isBuyer && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 text-xs font-semibold text-zinc-500 hover:text-zinc-900"
          >
            {MODAL_CLOSE_LABEL}
          </button>
        )}
      </div>

      <p className="mb-3 text-xs leading-relaxed text-zinc-600">
        {isBuyer ? BARANG_TIDAK_SESUAI_CLAIM_PROMPT : PENJUAL_JAWAB_PROMPT}
      </p>

      <form action={formAction} className="flex flex-col gap-3">
        {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

        <div>
          <textarea
            name="body"
            rows={4}
            maxLength={600}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              isBuyer ? BARANG_TIDAK_SESUAI_CLAIM_PLACEHOLDER : PENJUAL_JAWAB_PLACEHOLDER
            }
            className={inputClass}
          />
          <p className="mt-1 text-right text-xs text-zinc-400">{body.length}/600</p>
          <FieldError msg={state.fieldError} />
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-zinc-600">
          {STATEMENT_IMAGE_FIELD_LABEL}
          <input
            name="image"
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

        <ul className="flex list-disc flex-col gap-1 pl-5 text-xs leading-relaxed text-zinc-500">
          {GOODS_DISPUTE_CONSEQUENCES.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>

        <SubmitButton
          disabled={body.trim().length < 10 || (hasImage && !attested)}
          label={isBuyer ? BARANG_TIDAK_SESUAI_CLAIM_SUBMIT : PENJUAL_JAWAB_SUBMIT}
        />

        {isBuyer && typeof roundsLeft === 'number' && (
          <p className="text-xs text-zinc-500">{formatDisputeRoundsLeft(roundsLeft)}</p>
        )}
      </form>
    </Card>
  );
}
