'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { JoinDealState } from './actions';
import { ATTESTATIONS } from '@/lib/copy';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';

function SubmitButton({ allChecked }: { allChecked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!allChecked || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? 'Mencatat...' : 'Bergabung ke Kesepakatan'}
    </button>
  );
}

const initialState: JoinDealState = {};

export function JoinDealForm({
  action,
}: {
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [checked, setChecked] = useState<boolean[]>(
    Array(ATTESTATIONS.length + 1).fill(false),
  );

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
          Nomor HP Anda
        </label>
        <p className="mb-1 text-xs text-zinc-400">Format: 08xx atau +628xx</p>
        <input
          id="counterpart_phone"
          name="counterpart_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {fe.counterpart_phone && (
          <p className="mt-1 text-xs text-red-600">{fe.counterpart_phone}</p>
        )}
      </div>

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
