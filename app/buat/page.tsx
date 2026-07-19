'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeal, type CreateDealState } from './actions';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import {
  ATTESTATIONS,
  ROLE_LABELS,
  ROLE_PAIR,
  ROLE_PAIR_HELPER_PREFIX,
  TIER_LABELS,
  TIER_GRATIS_DESC,
  TIER_LIMA_RIBU_DESC,
  TIER_BERMETERAI_DESC,
  TIER_FOOTER,
} from '@/lib/copy';

const ROLES = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));

const TIERS = [
  { value: 'GRATIS', label: TIER_LABELS.GRATIS, desc: TIER_GRATIS_DESC },
  { value: 'LIMA_RIBU', label: TIER_LABELS.LIMA_RIBU, desc: TIER_LIMA_RIBU_DESC },
  { value: 'BERMETERAI', label: TIER_LABELS.BERMETERAI, desc: TIER_BERMETERAI_DESC },
];

function SubmitButton({ allChecked }: { allChecked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!allChecked || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? 'Mencatat...' : 'Buat Kesepakatan'}
    </button>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}

const initialState: CreateDealState = {};

export default function BuatPage() {
  const [state, formAction] = useActionState(createDeal, initialState);
  const [checked, setChecked] = useState<boolean[]>(
    Array(ATTESTATIONS.length + 1).fill(false),
  );
  const [selectedRole, setSelectedRole] = useState<string>('');

  const fe = state.fieldErrors ?? {};
  const allChecked = checked.every(Boolean);

  const toggle = (i: number) =>
    setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)));

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <a href="/" className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-800">
          ← SAKSI
        </a>
        <h1 className="mb-1 text-2xl font-bold text-zinc-900">Buat Kesepakatan</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Semua kolom wajib diisi. Data Anda diproses sesuai persetujuan di bawah.
        </p>

        {state.error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="flex flex-col gap-6">
          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="proposer_phone">
              Nomor HP Anda
            </label>
            <p className="mb-1 text-xs text-zinc-400">Format: 08xx atau +628xx</p>
            <input
              id="proposer_phone"
              name="proposer_phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <FieldError msg={fe.proposer_phone} />
          </div>

          {/* Role */}
          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">Peran Anda</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50"
                >
                  <input
                    type="radio"
                    name="proposer_role"
                    value={r.value}
                    onChange={() => setSelectedRole(r.value)}
                    className="sr-only"
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {(() => {
              const pairedKey = selectedRole ? ROLE_PAIR[selectedRole] : undefined;
              if (!pairedKey) return null;
              return (
                <p className="mt-2 text-xs text-zinc-500">
                  {ROLE_PAIR_HELPER_PREFIX} {ROLE_LABELS[pairedKey]}
                </p>
              );
            })()}
            <FieldError msg={fe.proposer_role} />
          </fieldset>

          {/* Item desc */}
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="item_desc">
              Deskripsi kesepakatan
            </label>
            <textarea
              id="item_desc"
              name="item_desc"
              rows={3}
              maxLength={500}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <FieldError msg={fe.item_desc} />
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="amount_idr">
              Nominal (Rp)
            </label>
            <input
              id="amount_idr"
              name="amount_idr"
              type="number"
              min={1}
              step={1}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <FieldError msg={fe.amount_idr} />
          </div>

          {/* Rekening */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-700" htmlFor="rekening_bank">
                Bank
              </label>
              <input
                id="rekening_bank"
                name="rekening_bank"
                type="text"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <FieldError msg={fe.rekening_bank} />
            </div>
            <div className="flex-[2]">
              <label
                className="block text-sm font-medium text-zinc-700"
                htmlFor="rekening_tujuan"
              >
                Nomor rekening tujuan pembayaran
              </label>
              <input
                id="rekening_tujuan"
                name="rekening_tujuan"
                type="text"
                inputMode="numeric"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <FieldError msg={fe.rekening_tujuan} />
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="deadline">
              Batas waktu
            </label>
            <input
              id="deadline"
              name="deadline"
              type="date"
              min={(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })()}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <FieldError msg={fe.deadline} />
          </div>

          {/* Tier */}
          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">Tier pencatatan</legend>
            <div className="mt-2 flex flex-col gap-2">
              {TIERS.map((t) => (
                <label
                  key={t.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-50"
                >
                  <input
                    type="radio"
                    name="tier"
                    value={t.value}
                    defaultChecked={t.value === 'GRATIS'}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <span className="font-medium text-zinc-900">{t.label}</span>
                    <p className="text-zinc-500">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {TIER_FOOTER}
            </p>
            <FieldError msg={fe.tier} />
          </fieldset>

          {/* 4 individual attestations + bundled T&C */}
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
      </div>
    </div>
  );
}
