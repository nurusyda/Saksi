'use client';

import { PendingContent } from '@/components/ui';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { lookupAccount, getRekeningLedgerAction, getPhoneLedgerAction, type CekState } from './actions';
import { BANK_OPTIONS, BANK_OTHER_VALUE, BANK_OTHER_LABEL } from '@/lib/banks';
import { LedgerDetail } from '@/components/LedgerDetail';
import {
  CEK_PAGE_HEADING,
  CEK_REKENING_TAB_LABEL,
  CEK_PHONE_TAB_LABEL,
  CEK_PHONE_FIELD_LABEL,
  CEK_BANK_FIELD_LABEL,
  CEK_REKENING_FIELD_LABEL,
  CEK_SUBMIT_LABEL,
  CEK_RATE_LIMIT_MESSAGE,
  CEK_INVALID_INPUT_MESSAGE,
  PHONE_FORMAT_HINT,
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  PENDING_DEFAULT_LABEL,
} from '@/lib/copy';

// B5 — public /cek page. Deliberately not linked from anywhere in the app
// (no homepage entry point, no nav link) — reachable only by direct URL,
// per the standing GATE 2 requirement (Option A distribution stays
// invite-only/no-discovery-surface until PSE clears). See page.tsx for the
// noindex metadata that backs this up at the crawler level.

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-witness px-6 text-sm font-semibold text-white transition-colors hover:bg-witness-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? <PendingContent label={PENDING_DEFAULT_LABEL} /> : CEK_SUBMIT_LABEL}
    </button>
  );
}

const initialState: CekState = { status: 'idle' };

export function CekForm() {
  const [state, formAction] = useActionState(lookupAccount, initialState);
  const [mode, setMode] = useState<'rekening' | 'phone'>('rekening');
  const [bank, setBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [rekening, setRekening] = useState('');
  const [phone, setPhone] = useState('');
  const effectiveBank = bank === BANK_OTHER_VALUE ? customBank : bank;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-zinc-900">{CEK_PAGE_HEADING}</h1>

      <div className="flex gap-2 rounded-lg border border-zinc-200 p-1">
        <button
          type="button"
          onClick={() => {
            setMode('rekening');
            setPhone('');
          }}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === 'rekening'
              ? 'bg-witness-soft font-semibold text-witness'
              : 'text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {CEK_REKENING_TAB_LABEL}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('phone');
            setRekening('');
          }}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            mode === 'phone'
              ? 'bg-witness-soft font-semibold text-witness'
              : 'text-zinc-600 hover:bg-zinc-50'
          }`}
        >
          {CEK_PHONE_TAB_LABEL}
        </button>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="mode" value={mode} />

        {mode === 'rekening' ? (
          // Stacks below `sm` (640px) — same fix as the identical
          // bank+rekening fields in app/buat/page.tsx and JoinDealForm.tsx
          // (label-wrap misalignment at 320px, found via viewport testing
          // 2026-07-20).
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="sm:flex-1">
              <label className="block text-sm font-medium text-zinc-700" htmlFor="cek_bank_select">
                {CEK_BANK_FIELD_LABEL}
              </label>
              <select
                id="cek_bank_select"
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
              <input type="hidden" name="bank" value={effectiveBank} />
            </div>
            <div className="sm:flex-[2]">
              <label className="block text-sm font-medium text-zinc-700" htmlFor="cek_rekening">
                {CEK_REKENING_FIELD_LABEL}
              </label>
              <input
                id="cek_rekening"
                name="rekening"
                type="text"
                inputMode="numeric"
                value={rekening}
                onChange={(e) => setRekening(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="cek_phone">
              {CEK_PHONE_FIELD_LABEL}
            </label>
            <p className="mb-1 text-xs text-zinc-500">{PHONE_FORMAT_HINT}</p>
            <input
              id="cek_phone"
              name="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
          </div>
        )}

        <SubmitButton />
      </form>

      {state.status === 'found' && (
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
          <p>{state.line}</p>
          {state.ledgerEnabled && (
            <LedgerDetail
              onFetch={() => (mode === 'rekening' ? getRekeningLedgerAction(effectiveBank, rekening) : getPhoneLedgerAction(phone))}
            />
          )}
        </div>
      )}
      {state.status === 'empty' && (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
          {FORCED_CHECK_EMPTY_STATE}
        </p>
      )}
      {state.status === 'invalid_input' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {CEK_INVALID_INPUT_MESSAGE}
        </p>
      )}
      {state.status === 'rate_limited' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {CEK_RATE_LIMIT_MESSAGE}
        </p>
      )}
      {state.status === 'error' && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERROR_ACCOUNT_HISTORY_UNAVAILABLE}
        </p>
      )}
    </div>
  );
}
