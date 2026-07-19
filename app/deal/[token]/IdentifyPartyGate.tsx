'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { IdentifyState } from './paymentActions';
import type { WhichParty } from '@/lib/db/party';
import { PHONE_FIELD_LABEL, PHONE_FORMAT_HINT } from '@/lib/copy';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? 'Memeriksa...' : 'Lanjutkan'}
    </button>
  );
}

const initialState: IdentifyState = {};

/**
 * View-only phone gate shared by every post-DISEPAKATI screen (C3/C4/C5).
 * No login/session exists in this app (see identifyPartyByPhone) — this is
 * purely a UI decision about which read-only view to render; every mutating
 * action re-derives whichParty from the phone independently, never trusts
 * `whichParty` as passed down here.
 */
export function IdentifyPartyGate({
  action,
  children,
}: {
  action: (prev: IdentifyState, formData: FormData) => Promise<IdentifyState>;
  children: (whichParty: WhichParty, phone: string) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [phone, setPhone] = useState('');

  if (state.whichParty) {
    return <>{children(state.whichParty, phone)}</>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div>
        <label className="block text-sm font-medium text-zinc-700" htmlFor="identify_phone">
          {PHONE_FIELD_LABEL}
        </label>
        <p className="mb-1 text-xs text-zinc-500">{PHONE_FORMAT_HINT}</p>
        <input
          id="identify_phone"
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
