'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { JoinDealState } from './actions';
import { ATTESTATIONS, PHONE_FIELD_LABEL, PHONE_FORMAT_HINT, PENDING_SAVE_LABEL } from '@/lib/copy';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { BANK_OPTIONS, BANK_OTHER_VALUE, BANK_OTHER_LABEL } from '@/lib/banks';
import { usePersistedPhone } from '@/lib/usePersistedPhone';

function SubmitButton({ allChecked }: { allChecked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!allChecked || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_SAVE_LABEL : 'Bergabung ke Kesepakatan'}
    </button>
  );
}

const initialState: JoinDealState = {};

export function JoinDealForm({
  action,
  needsRekening = false,
}: {
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
  // C2 — true when this deal's proposer is Pembeli, meaning the counterpart
  // joining here is Penjual and must supply the destination account (the
  // proposer never had one to give at create time).
  needsRekening?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [checked, setChecked] = useState<boolean[]>(
    Array(ATTESTATIONS.length + 1).fill(false),
  );
  const [bank, setBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  // Written to sessionStorage on change — with the accept step folded away
  // (2026-07-20), joining now finalizes DISEPAKATI immediately, so this is
  // the counterpart's only phone entry before every later screen; it has to
  // populate the same store IdentifyPartyGate reads to skip re-asking.
  const [phone, setPhone] = usePersistedPhone();
  const effectiveBank = bank === BANK_OTHER_VALUE ? customBank : bank;

  const fe = state.fieldErrors ?? {};
  const allChecked = checked.every(Boolean);
  const toggle = (i: number) =>
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="counterpart_phone">
          {PHONE_FIELD_LABEL}
        </label>
        <p className="mb-1 text-xs text-zinc-500">{PHONE_FORMAT_HINT}</p>
        <input
          id="counterpart_phone"
          name="counterpart_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {fe.counterpart_phone && (
          <p className="mt-1 text-xs text-red-600">{fe.counterpart_phone}</p>
        )}
      </div>

      {needsRekening && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="rekening_bank_select">
              Bank
            </label>
            <select
              id="rekening_bank_select"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            >
              <option value="">Pilih bank</option>
              {BANK_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value={BANK_OTHER_VALUE}>{BANK_OTHER_LABEL}</option>
            </select>
            {bank === BANK_OTHER_VALUE && (
              <input
                type="text"
                value={customBank}
                onChange={(e) => setCustomBank(e.target.value)}
                placeholder="Nama bank"
                className="mt-2 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
            )}
            <input type="hidden" name="rekening_bank" value={effectiveBank} />
            {fe.rekening_bank && <p className="mt-1 text-xs text-red-600">{fe.rekening_bank}</p>}
          </div>
          <div className="flex-[2]">
            <label className="block text-sm font-medium text-zinc-700" htmlFor="rekening_tujuan">
              Nomor rekening tujuan pembayaran
            </label>
            <input
              id="rekening_tujuan"
              name="rekening_tujuan"
              type="text"
              inputMode="numeric"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            {fe.rekening_tujuan && (
              <p className="mt-1 text-xs text-red-600">{fe.rekening_tujuan}</p>
            )}
          </div>
        </div>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-zinc-700">Pernyataan</legend>
        {ATTESTATIONS.map((text, i) => (
          <label key={i} className="flex items-start gap-3 text-sm text-zinc-700">
            <input
              type="checkbox"
              name={`attest_${i}`}
              checked={checked[i]}
              onChange={() => toggle(i)}
              className="mt-0.5 shrink-0"
            />
            <span>{text}</span>
          </label>
        ))}
        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="attest_tc"
            checked={checked[ATTESTATIONS.length]}
            onChange={() => toggle(ATTESTATIONS.length)}
            className="mt-0.5 shrink-0"
          />
          <TCLabel />
        </label>
        <PrivacyLink />
      </fieldset>

      <SubmitButton allChecked={allChecked} />
    </form>
  );
}
