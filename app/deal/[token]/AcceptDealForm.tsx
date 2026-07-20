'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { AcceptDealState } from './actions';
import { usePersistedPhone } from '@/lib/usePersistedPhone';
import { ACCEPT_BUTTON_LABEL, PHONE_FIELD_LABEL, PHONE_FORMAT_HINT, PENDING_DEFAULT_LABEL } from '@/lib/copy';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_DEFAULT_LABEL : ACCEPT_BUTTON_LABEL}
    </button>
  );
}

const initialState: AcceptDealState = {};

export function AcceptDealForm({
  action,
}: {
  action: (prev: AcceptDealState, formData: FormData) => Promise<AcceptDealState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [phone, setPhone] = usePersistedPhone();

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.info && (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          {state.info}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="phone">
          {PHONE_FIELD_LABEL}
        </label>
        <p className="mb-1 text-xs text-zinc-500">{PHONE_FORMAT_HINT}</p>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <SubmitButton />
    </form>
  );
}
