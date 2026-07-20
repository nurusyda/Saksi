'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeal, checkAccountHistory, getRekeningLedgerAction, type CreateDealState, type AccountHistoryDisplay } from './actions';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { LedgerDetail } from '@/components/LedgerDetail';
import { BANK_OPTIONS, BANK_OTHER_VALUE, BANK_OTHER_LABEL } from '@/lib/banks';
import { getTomorrowWib } from '@/lib/format';
import { usePersistedPhone } from '@/lib/usePersistedPhone';
import {
  ATTESTATIONS,
  ITEM_TITLE_LABEL,
  ITEM_TITLE_PLACEHOLDER,
  ITEM_DETAIL_LABEL,
  ITEM_DETAIL_PLACEHOLDER,
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
  PENDING_SAVE_LABEL,
  RINGKASAN_KESEPAKATAN_HEADING,
} from '@/lib/copy';

// Deal-type gating: only jual-beli is selectable for now. Backend/schema/
// state machine keep supporting all role pairs — see actions.ts for the
// matching server-side rejection. The jenis-transaksi selector itself (Section
// B) was removed from this form entirely per the UX audit (2026-07-20) — it
// offered no real choice (only jual-beli was ever functional) and just added
// visual clutter ahead of the fields that do matter.
const SELECTABLE_ROLES = [
  { value: 'PENJUAL', label: ROLE_LABELS.PENJUAL },
  { value: 'PEMBELI', label: ROLE_LABELS.PEMBELI },
];

// Locked tier descriptions include a "${price} · " prefix (copy-id.md §6).
// The card header already shows the price; strip the prefix so the
// description body shows only the value-proposition text.
function stripPricePrefix(desc: string): string {
  const idx = desc.indexOf(' · ');
  return idx === -1 ? desc : desc.slice(idx + 3);
}

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

// UX-audit fix pass (2026-07-20): the form was a single flat scroll of 8
// field-groups with no visual chunking — the heaviest single screen in the
// app. Grouped into labeled sections here (layout only, no field/validation
// change). Section labels reuse text already shipped elsewhere in the app
// rather than inventing new copy: "Peran Anda" was already this form's own
// role-fieldset legend (promoted here, de-duped below), "Ringkasan
// Kesepakatan" is the exact heading already used for the same item+amount
// facts on the deal page and payment screen (page.tsx, DisepakatiPanel.tsx).
// "Pembayaran" is new — a single common noun, not a claim or legal-adjacent
// string, flagged for confirmation same as any other new label. The Tier
// and Pernyataan fieldsets keep their own existing legends unwrapped below —
// already self-labeled and visually distinct, an umbrella label there would
// be redundant.
function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 border-t border-zinc-100 pt-6 first:border-0 first:pt-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      {children}
    </div>
  );
}

// Format a raw numeric string with Indonesian thousand-separator (dots).
// Only formats the display; the hidden input submits the raw digits.
function formatNominal(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

// Locale-aware placeholder: "1.000.000" instead of "1000000"
const NOMINAL_PLACEHOLDER = (1000000).toLocaleString('id-ID');

const initialState: CreateDealState = {};

export default function BuatPage() {
  const [state, formAction] = useActionState(createDeal, initialState);
  const [tcChecked, setTcChecked] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [bank, setBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [itemDetail, setItemDetail] = useState('');
  const [nominalDisplay, setNominalDisplay] = useState('');
  const [rawNominal, setRawNominal] = useState('');
  const [rekening, setRekening] = useState('');
  const [history, setHistory] = useState<AccountHistoryDisplay>({ status: 'idle' });
  const [minDeadline, setMinDeadline] = useState<string | undefined>(undefined);
  // Written to sessionStorage on change, same as IdentifyPartyGate's phone
  // field — with the accept step folded away (2026-07-20), this is the only
  // place the proposer's phone is ever typed, so it has to populate the
  // same store IdentifyPartyGate reads to skip re-asking on later screens.
  const [proposerPhone, setProposerPhone] = usePersistedPhone();
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
          <FormSection label="Peran Anda">
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
                value={proposerPhone}
                onChange={(e) => setProposerPhone(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <FieldError msg={fe.proposer_phone} />
            </div>

            {/* Role — legend removed, de-duped against this section's own
                "Peran Anda" header just above. */}
            <fieldset>
              <div className="flex flex-wrap gap-2">
                {SELECTABLE_ROLES.map((r) => (
                  <label
                    key={r.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"
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
          </FormSection>

          <FormSection label={RINGKASAN_KESEPAKATAN_HEADING}>
            {/* Item title + optional detail — replaces the old single free-text
                description (UX audit, 2026-07-20). A short required title reads
                as "name the thing", not "compose a paragraph"; the detail box
                is where specifics like condition/inclusions go, only if the
                seller bothers. Composed server-side into item_desc, the single
                DB column this has always been (see actions.ts). */}
            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="item_title">
                {ITEM_TITLE_LABEL}
              </label>
              <input
                id="item_title"
                name="item_title"
                type="text"
                maxLength={80}
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                placeholder={ITEM_TITLE_PLACEHOLDER}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-zinc-400">
                {itemTitle.length}/80
              </p>
              <FieldError msg={fe.item_title} />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="item_detail">
                {ITEM_DETAIL_LABEL}
              </label>
              <textarea
                id="item_detail"
                name="item_detail"
                rows={2}
                maxLength={400}
                value={itemDetail}
                onChange={(e) => setItemDetail(e.target.value)}
                placeholder={ITEM_DETAIL_PLACEHOLDER}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
              <p className="mt-1 text-right text-xs text-zinc-400">
                {itemDetail.length}/400
              </p>
              <FieldError msg={fe.item_detail} />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="amount_display">
                Nominal (Rp)
              </label>
              <input
                id="amount_display"
                type="text"
                inputMode="numeric"
                value={nominalDisplay}
                placeholder={NOMINAL_PLACEHOLDER}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, '');
                  setRawNominal(raw);
                  setNominalDisplay(formatNominal(raw));
                }}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
              <input type="hidden" name="amount_idr" value={rawNominal} />
              <FieldError msg={fe.amount_idr} />
            </div>
          </FormSection>

          <FormSection label="Pembayaran">
            {/* Rekening (C1) — only Penjual has a destination account to offer
                at create time. When proposer is Pembeli, the seller supplies
                this later when joining (see JoinDealForm.tsx, C2). */}
            {selectedRole === 'PENJUAL' && (
              <>
                {/* Stacks below `sm` (640px): found via actual viewport testing
                    (2026-07-20) that at 320px the label "Nomor rekening tujuan
                    pembayaran" wraps to two lines while "Bank"'s doesn't,
                    leaving the two inputs visibly misaligned in a cramped
                    1:2 side-by-side split. Side-by-side from sm: up, where
                    there's room for both labels on one line each. */}
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
                    <FieldError msg={fe.rekening_bank} />
                  </div>
                  <div className="sm:flex-[2]">
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

                {history.status === 'found' && history.ledgerEnabled && (
                  <LedgerDetail onFetch={() => getRekeningLedgerAction(effectiveBank, rekening)} />
                )}
              </>
            )}

            {/* Deadline */}
            <div>
              <label className="block text-sm font-medium text-zinc-700" htmlFor="deadline">
                Batas waktu pembayaran
              </label>
              {/* DRAFT — not yet in copy-id.md. Review wording after seeing in context. */}
              <p className="text-xs text-zinc-500">
                Tanggal terakhir pembayaran atau pemenuhan kesepakatan harus terjadi.
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
          </FormSection>

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
              {/* Paid tiers — merged into one shared card (UX-audit fix pass,
                  2026-07-20): two separately bordered/shadowed boxes took
                  more vertical space than two not-yet-available options
                  need. Both checkboxes and their `name` attributes are
                  otherwise untouched — they're the app's pre-launch
                  per-tier willingness-to-pay signal (feature_interest,
                  migrations 0012/0016), measured separately on purpose, not
                  decoration to prune. */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 text-xs shadow-sm shadow-zinc-200/50">
                <div className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-zinc-500">
                      <input type="checkbox" name="interest_tier_lima_ribu" className="shrink-0" />
                      <span className="font-medium">{TIER_LABELS.LIMA_RIBU}</span>
                    </label>
                    <span className="ml-auto rounded-full border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] leading-tight text-zinc-400">
                      {NOTIFY_ME_LABEL}
                    </span>
                  </div>
                  <p className="mt-0.5 text-zinc-400">{stripPricePrefix(TIER_LIMA_RIBU_DESC)}</p>
                </div>
                <div className="border-t border-zinc-200 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="flex items-center gap-1 text-zinc-500">
                      <input type="checkbox" name="interest_tier_bermeterai" className="shrink-0" />
                      <span className="font-medium">{TIER_LABELS.BERMETERAI}</span>
                    </label>
                    <span className="ml-auto rounded-full border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] leading-tight text-zinc-400">
                      {NOTIFY_ME_LABEL}
                    </span>
                  </div>
                  <p className="mt-0.5 text-zinc-400">{stripPricePrefix(TIER_BERMETERAI_DESC)}</p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {TIER_FOOTER}
            </p>
            <FieldError msg={fe.tier} />
          </fieldset>

          {/* Pernyataan — displayed as fine print above the single T&C consent
              checkbox, matching JoinDealForm's 2026-07-20 design. */}
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
      </div>
    </div>
  );
}
