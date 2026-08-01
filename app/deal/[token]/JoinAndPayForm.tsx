'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { JoinDealState } from './actions';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { AttestationChecklist, allAttested } from '@/components/AttestationChecklist';
import { ErrorBanner, FieldError, Field, inputClass, buttonClass, PendingContent } from '@/components/ui';
import { usePersistedPhone } from '@/lib/usePersistedPhone';
import {
  ATTESTATIONS,
  PHONE_FIELD_LABEL,
  PHONE_FORMAT_HINT,
  PENDING_SAVE_LABEL,
  BUKTI_ATTESTATION,
  BUKTI_FIELD_LABEL,
  SEND_BUKTI_LABEL,
} from '@/lib/copy';

// §31 — phone + bukti in one submit.
//
// This replaces a form whose only field was a phone number, which stood
// between the buyer and the account number they had come to pay into. Both
// are collected here at the one moment the buyer actually has something to
// submit: after they have transferred.
//
// The send button stays disabled until BOTH the file and both consents are
// present, matching SAKSI-MASTER.md §5's gate ("send disabled until checked
// + file"). The T&C consent and the bukti forgery attestation are separate
// checkboxes on purpose — they are two different statements (agreeing to the
// terms vs. asserting this specific file is genuine) and bundling them would
// collect one click for two consents.

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={!ready || pending} className={buttonClass.primary}>
      {pending ? <PendingContent label={PENDING_SAVE_LABEL} /> : SEND_BUKTI_LABEL}
    </button>
  );
}

const initialState: JoinDealState = {};

export function JoinAndPayForm({
  action,
  mode = 'join',
}: {
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
  /**
   * 'join' — deal is DRAF, this submit joins and pays in one go.
   * 'pay'  — deal is already DISEPAKATI (the party exists), only the bukti is
   *          left. The phone field stays either way: there is no session, so
   *          it is what identifies the submitter. The T&C block does NOT,
   *          because that consent was already given and recorded at join —
   *          re-collecting it would imply the first one did not count.
   */
  mode?: 'join' | 'pay';
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [phone, setPhone] = usePersistedPhone();
  const [tcChecked, setTcChecked] = useState(false);
  const [attestChecked, setAttestChecked] = useState(() => Array(ATTESTATIONS.length).fill(false));
  const [buktiChecked, setBuktiChecked] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const fe = state.fieldErrors ?? {};
  const needsTc = mode === 'join';
  const ready =
    Boolean(file) &&
    buktiChecked &&
    phone.trim().length > 0 &&
    (!needsTc || (allAttested(attestChecked) && tcChecked));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

      <Field
        label={PHONE_FIELD_LABEL}
        htmlFor="counterpart_phone"
        hint={PHONE_FORMAT_HINT}
        error={fe.counterpart_phone}
      >
        <input
          id="counterpart_phone"
          name="counterpart_phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label={BUKTI_FIELD_LABEL} htmlFor="bukti_file">
        <input
          id="bukti_file"
          name="bukti_file"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm`}
        />
      </Field>

      <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-700">
        <input
          type="checkbox"
          name="attest_bukti"
          checked={buktiChecked}
          onChange={(e) => setBuktiChecked(e.target.checked)}
          className="mt-0.5 shrink-0 accent-[var(--witness)]"
        />
        <span>{BUKTI_ATTESTATION}</span>
      </label>

      {needsTc && (
      <fieldset className="flex flex-col gap-3 border-t border-zinc-100 pt-4">
        <AttestationChecklist checked={attestChecked} onChange={setAttestChecked} />
        <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-700">
          <input
            type="checkbox"
            name="attest_tc"
            checked={tcChecked}
            onChange={() => setTcChecked((v) => !v)}
            disabled={!allAttested(attestChecked)}
            className="mt-0.5 shrink-0 accent-[var(--witness)] disabled:opacity-40"
          />
          <TCLabel />
        </label>
        <PrivacyLink />
      </fieldset>
      )}

      <FieldError msg={fe.attest_tc} />
      <SubmitButton ready={ready} />
    </form>
  );
}
