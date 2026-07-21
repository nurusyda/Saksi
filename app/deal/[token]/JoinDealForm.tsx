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
  JOIN_SUBMIT_LABEL_NEEDS_REKENING,
} from '@/lib/copy';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { BANK_OPTIONS, BANK_OTHER_VALUE, BANK_OTHER_LABEL } from '@/lib/banks';
import { usePersistedPhone } from '@/lib/usePersistedPhone';

function SubmitButton({ allChecked, label }: { allChecked: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!allChecked || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_SAVE_LABEL : label}
    </button>
  );
}

const initialState: JoinDealState = {};

// copy-id.md §21. Code review (2026-07-21) caught that the create form
// hardcoding proposer_role to PENJUAL (§20) does NOT close off PEMBELI at
// the data or backend layer: app/buat/actions.ts's validRoles still accepts
// it, and app/deal/[token]/actions.ts still requires rekening_tujuan/
// rekening_bank from the counterpart whenever deal.proposer_role ===
// 'PEMBELI' (C2 — the proposer never had a rekening to give at create time
// in that case). A prior version of this component deleted the
// needsRekening branch outright on the premise that it was unreachable —
// false: any PEMBELI-proposed DRAF row (pre-existing, or created by any
// non-UI caller) would land on this form with no way to supply the required
// fields and no way to join. Restored: needsRekening must stay a real,
// gated branch, not deleted UI for a state the backend still permits.
export function JoinDealForm({
  action,
  needsRekening = false,
}: {
  action: (prev: JoinDealState, formData: FormData) => Promise<JoinDealState>;
  // C2 — true when this deal's proposer is Pembeli, meaning the counterpart
  // joining here is Penjual and must supply the destination account.
  needsRekening?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [tcChecked, setTcChecked] = useState(false);
  const [bank, setBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [phone, setPhone] = usePersistedPhone();
  const effectiveBank = bank === BANK_OTHER_VALUE ? customBank : bank;

  const fe = state.fieldErrors ?? {};

  // The "Lihat Rekening & Bayar" framing (§21) is only accurate when this
  // joiner is the payer — i.e. the common, only-reachable-via-UI case where
  // the proposer already supplied a rekening at create time. In the
  // needsRekening branch the joiner is the SELLER supplying a rekening for
  // someone else (the proposer) to pay later, not paying themselves — so
  // that case keeps the original, role-neutral label instead of claiming
  // "& Bayar" for an action this joiner isn't about to take.
  const submitLabel = needsRekening ? JOIN_SUBMIT_LABEL_NEEDS_REKENING : JOIN_SUBMIT_LABEL;

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
        // Stacks below `sm` (640px) — see app/buat/page.tsx's identical
        // fields for why (label-wrap misalignment at 320px, found via
        // viewport testing 2026-07-20).
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="sm:flex-1">
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
          <div className="sm:flex-[2]">
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

      {/* Consent (copy-id.md §4/§21): content unchanged, restored to a
          readable, accessible presentation after a prior pass over-shrank
          it (text-zinc-400 at 11px, ~2.5:1 contrast — below WCAG AA's 4.5:1
          for text this size) and dropped the fieldset's accessible group
          name. text-zinc-500/text-xs matches the contrast level already
          used for hints and field errors elsewhere in this form, which
          passes AA. */}
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

      <SubmitButton allChecked={tcChecked} label={submitLabel} />
    </form>
  );
}
