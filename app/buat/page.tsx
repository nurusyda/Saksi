'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeal, checkAccountHistory, type CreateDealState, type AccountHistoryDisplay } from './actions';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { BANK_OPTIONS, BANK_OTHER_VALUE, BANK_OTHER_LABEL } from '@/lib/banks';
import { getTomorrowWib } from '@/lib/format';
import {
  ATTESTATIONS,
  ITEM_DESC_PLACEHOLDER,
  ROLE_LABELS,
  ROLE_PAIR,
  ROLE_PAIR_HELPER_PREFIX,
  TIER_LABELS,
  TIER_GRATIS_DESC,
  TIER_LIMA_RIBU_DESC,
  TIER_BERMETERAI_DESC,
  TIER_FOOTER,
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  formatAccountHistory,
  PHONE_FIELD_LABEL,
  PHONE_FORMAT_HINT,
  NOTIFY_ME_LABEL,
  DEAL_TYPE_LABELS,
  SEGERA_HADIR_LABEL,
  PENDING_SAVE_LABEL,
} from '@/lib/copy';

// Deal-type gating: only jual-beli is selectable for now. Backend/schema/
// state machine keep supporting all role pairs — see actions.ts for the
// matching server-side rejection.
const SELECTABLE_ROLES = [
  { value: 'PENJUAL', label: ROLE_LABELS.PENJUAL },
  { value: 'PEMBELI', label: ROLE_LABELS.PEMBELI },
];

// Unavailable role groups — compact "segera hadir" cards with grey shadow
// so they read as informational, not interactive. PEMBERI_PINJAMAN/PEMINJAM
// and PEMILIK/PENYEWA show both complementary roles in one card.
const UNAVAILABLE_ROLE_GROUPS = [
  { key: 'PINJAM_MEMINJAM', label: `${ROLE_LABELS.PEMBERI_PINJAMAN} / ${ROLE_LABELS.PEMINJAM}` },
  { key: 'SEWA_MENYEWA', label: `${ROLE_LABELS.PEMILIK} / ${ROLE_LABELS.PENYEWA}` },
];

// Section B — jenis transaksi selector. Only jual-beli is functional;
// pinjam-meminjam/sewa-menyewa render disabled with an interest checkbox.
const UNAVAILABLE_DEAL_TYPES = [
  { key: 'PINJAM_MEMINJAM', label: DEAL_TYPE_LABELS.PINJAM_MEMINJAM, fieldName: 'interest_pinjam_meminjam' },
  { key: 'SEWA_MENYEWA', label: DEAL_TYPE_LABELS.SEWA_MENYEWA, fieldName: 'interest_sewa_menyewa' },
];

function SubmitButton({ allChecked }: { allChecked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!allChecked || pending}
      className="flex h-12 w-full items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? PENDING_SAVE_LABEL : 'Buat Kesepakatan'}
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
  const [bank, setBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [rekening, setRekening] = useState('');
  const [history, setHistory] = useState<AccountHistoryDisplay>({ status: 'idle' });
  const [minDeadline, setMinDeadline] = useState<string | undefined>(undefined);
  const effectiveBank = bank === BANK_OTHER_VALUE ? customBank : bank;

  // Computed client-side (not inline at render) so the WIB "tomorrow" the
  // date picker enforces matches getTodayWib()'s server-side check exactly —
  // a local-clock Date() here would drift for non-WIB browsers and could
  // also disagree between SSR and hydration.
  useEffect(() => {
    setMinDeadline(getTomorrowWib());
  }, []);

  useEffect(() => {
    if (!effectiveBank || !rekening) {
      setHistory({ status: 'idle' });
      return;
    }
    let ignore = false;
    const timer = setTimeout(() => {
      checkAccountHistory(effectiveBank, rekening)
        .then((r) => {
          if (!ignore) setHistory(r);
        })
        .catch(() => {
          if (!ignore) setHistory({ status: 'error' });
        });
    }, 500);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [effectiveBank, rekening]);

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
          {/* Jenis transaksi (Section B) — Jual-beli is the only functional
              type; the other two are visible but disabled with a
              notify-me checkbox. Not a DB field: deal type is fully implied
              by proposer_role (validated server-side in actions.ts), so this
              selector carries no name and posts nothing on its own. */}
          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">Jenis transaksi</legend>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex cursor-default items-center gap-2 rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-sm">
                <span className="font-medium text-blue-900">{DEAL_TYPE_LABELS.JUAL_BELI}</span>
              </div>
              {UNAVAILABLE_DEAL_TYPES.map((d) => (
                <div key={d.key} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 text-xs shadow-sm shadow-zinc-200/50">
                  <span className="font-medium text-zinc-500">{d.label}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-400">{SEGERA_HADIR_LABEL}</span>
                  <label className="ml-auto flex items-center gap-1 text-zinc-500">
                    <input type="checkbox" name={d.fieldName} className="shrink-0" />
                    {NOTIFY_ME_LABEL}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="proposer_phone">
              {PHONE_FIELD_LABEL}
            </label>
            <p className="mb-1 text-xs text-zinc-500">{PHONE_FORMAT_HINT}</p>
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
              {SELECTABLE_ROLES.map((r) => (
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
            <div className="mt-2 flex flex-col gap-1.5">
              {UNAVAILABLE_ROLE_GROUPS.map((g) => (
                <div key={g.key} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 text-xs shadow-sm shadow-zinc-200/50">
                  <span className="font-medium text-zinc-500">{g.label}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-400">{SEGERA_HADIR_LABEL}</span>
                </div>
              ))}
            </div>
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
              placeholder={ITEM_DESC_PLACEHOLDER[selectedRole] ?? ITEM_DESC_PLACEHOLDER.LAINNYA}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
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

          {/* Rekening (C1) — only Penjual has a destination account to offer
              at create time. When proposer is Pembeli, the seller supplies
              this later when joining (see JoinDealForm.tsx, C2). */}
          {selectedRole === 'PENJUAL' && (
            <>
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
                    value={rekening}
                    onChange={(e) => setRekening(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                  <FieldError msg={fe.rekening_tujuan} />
                </div>
              </div>

              {history.status !== 'idle' && (
                <p className="-mt-3 text-xs text-zinc-500">
                  {history.status === 'found' &&
                    formatAccountHistory(
                      effectiveBank,
                      history.rekeningMasked,
                      history.selesaiCount,
                      history.tidakDipenuhiCount,
                      history.sinceLabel,
                    )}
                  {history.status === 'empty' && FORCED_CHECK_EMPTY_STATE}
                  {history.status === 'error' && ERROR_ACCOUNT_HISTORY_UNAVAILABLE}
                </p>
              )}
            </>
          )}

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-zinc-700" htmlFor="deadline">
              Batas waktu
            </label>
            <p className="text-xs text-zinc-500">
              Tanggal terakhir kesepakatan harus dipenuhi. Setelah lewat, pihak terkait akan diingatkan. Kesepakatan yang tidak ada tindak lanjut dapat berakhir kedaluwarsa.
            </p>
            <input
              id="deadline"
              name="deadline"
              type="date"
              min={minDeadline}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <FieldError msg={fe.deadline} />
          </div>

          {/* Tier */}
          <fieldset>
            <legend className="text-sm font-medium text-zinc-700">Tingkatan pencatatan</legend>
            <div className="mt-2 flex flex-col gap-2">
              <label
                key="GRATIS"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  name="tier"
                  value="GRATIS"
                  defaultChecked
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <span className="font-medium text-blue-900">{TIER_LABELS.GRATIS}</span>
                  <p className="text-zinc-500">{TIER_GRATIS_DESC}</p>
                </div>
              </label>
              {/* Paid tiers — compact "segera hadir" cards */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 text-xs shadow-sm shadow-zinc-200/50">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-zinc-500">{TIER_LABELS.LIMA_RIBU}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-400">{SEGERA_HADIR_LABEL}</span>
                  <label className="ml-auto flex shrink-0 items-center gap-1 text-zinc-500">
                    <input type="checkbox" name="interest_tier_lima_ribu" className="shrink-0" />
                    {NOTIFY_ME_LABEL}
                  </label>
                </div>
                <p className="mt-0.5 text-zinc-400">{TIER_LIMA_RIBU_DESC}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 text-xs shadow-sm shadow-zinc-200/50">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-zinc-500">{TIER_LABELS.BERMETERAI}</span>
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-400">{SEGERA_HADIR_LABEL}</span>
                  <label className="ml-auto flex shrink-0 items-center gap-1 text-zinc-500">
                    <input type="checkbox" name="interest_tier_bermeterai" className="shrink-0" />
                    {NOTIFY_ME_LABEL}
                  </label>
                </div>
                <p className="mt-0.5 text-zinc-400">{TIER_BERMETERAI_DESC}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
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
