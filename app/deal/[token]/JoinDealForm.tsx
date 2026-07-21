'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { JoinDealState } from './actions';
import {
  ATTESTATIONS,
  PHONE_FIELD_LABEL,
  PHONE_FORMAT_HINT,
  PENDING_SAVE_LABEL,
  JOIN_SUBMIT_LABEL,
} from '@/lib/copy';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { usePersistedPhone } from '@/lib/usePersistedPhone';

function SubmitButton({ allChecked }: { allChecked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!allChecked || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-witness px-6 text-sm font-semibold text-white transition-colors hover:bg-witness-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_SAVE_LABEL : JOIN_SUBMIT_LABEL}
    </button>
  );
}

const initialState: JoinDealState = {};

// copy-id.md §22. app/buat/actions.ts now only accepts PENJUAL as a
// proposer_role (closed 2026-07-21, replacing the earlier defensive
// PEMBELI-acceptance that a prior version of this component's UI silently
// assumed away without the backend actually enforcing it — see §22 for the
// full history). That makes "the counterpart joining here is always the
// payer" an enforced fact, not a UI default: this form has exactly one job,
// phone number in, straight through to the rekening/history/copy/bukti
// screen. No rekening-collection branch — there is no deal shape left where
// this joiner would need to supply one.
export function JoinDealForm({
  action,
}: {
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [tcChecked, setTcChecked] = useState(false);
  const [phone, setPhone] = usePersistedPhone();

  const fe = state.fieldErrors ?? {};

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

      {/* Consent (copy-id.md §4): content verbatim, compact presentation.
          text-xs text-zinc-500 matches the contrast level already used for
          hints/errors elsewhere in this form (passes WCAG AA). */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-zinc-700">Pernyataan</legend>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs text-zinc-500">
          {ATTESTATIONS.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
        <label className="flex items-start gap-3 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="attest_tc"
            checked={tcChecked}
            onChange={() => setTcChecked((v) => !v)}
            className="mt-0.5 shrink-0"
          />
          <TCLabel />
        </label>
        <PrivacyLink />
      </fieldset>

      <SubmitButton allChecked={tcChecked} />
    </form>
  );
}
