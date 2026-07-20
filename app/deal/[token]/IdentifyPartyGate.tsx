'use client';

import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { IdentifyState } from './paymentActions';
import type { WhichParty } from '@/lib/db/party';
import { usePersistedPhone } from '@/lib/usePersistedPhone';
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
 *
 * `initialWhichParty`, when present, comes from the short-lived party-session
 * cookie read server-side in page.tsx (see partySession.ts) — set the last
 * time this same party identified themselves on this deal (accept, or a
 * prior visit to one of these screens), within the last ~45 minutes. It
 * lets a party who just accepted or just viewed another status screen skip
 * re-typing a phone they already entered moments ago. It carries ONLY the
 * whichParty role label, never a phone (monster_check BLOCKER, fixed
 * 2026-07-20 — Next.js serializes RSC props into the client payload, so the
 * phone must never be one of them, even the viewer's own). The phone used
 * to render this skip path comes from usePersistedPhone() instead — the
 * same client-side sessionStorage value the preceding accept/identify form
 * already wrote, never server-sent. If that's empty (cleared storage, a
 * different tab) the form below renders regardless of the cookie, which is
 * the safe degrade: re-collect the phone rather than bind an empty one into
 * a follow-up action. Once the cookie expires, this form is exactly what
 * renders again — phone re-entry remains the permanent fallback either way.
 */
export function IdentifyPartyGate({
  action,
  initialWhichParty,
  children,
}: {
  action: (prev: IdentifyState, formData: FormData) => Promise<IdentifyState>;
  initialWhichParty?: WhichParty | null;
  children: (whichParty: WhichParty, phone: string) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [phone, setPhone] = usePersistedPhone();

  if (state.whichParty) {
    return <>{children(state.whichParty, phone)}</>;
  }

  if (initialWhichParty && phone) {
    return <>{children(initialWhichParty, phone)}</>;
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
