'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createDeal, checkAccountHistory, getRekeningLedgerAction, type CreateDealState, type AccountHistoryDisplay } from './actions';
import { TCLabel } from '@/components/TCLabel';
import { PrivacyLink } from '@/components/PrivacyLink';
import { LedgerDetail } from '@/components/LedgerDetail';
import {
  PageShell,
  PageTitle,
  Card,
  SectionLabel,
  Field,
  ErrorBanner,
  inputClass,
  buttonClass,
  PendingContent,
} from '@/components/ui';
import { BANK_OPTIONS, BANK_OTHER_VALUE, BANK_OTHER_LABEL } from '@/lib/banks';
import { usePersistedPhone } from '@/lib/usePersistedPhone';
import {
  ATTESTATIONS,
  ITEM_TITLE_LABEL,
  ITEM_TITLE_PLACEHOLDER,
  ITEM_DETAIL_LABEL,
  ITEM_DETAIL_PLACEHOLDER,
  FORCED_CHECK_EMPTY_STATE,
  ERROR_ACCOUNT_HISTORY_UNAVAILABLE,
  formatAccountHistory,
  PHONE_FIELD_LABEL,
  PHONE_FORMAT_HINT,
  PENDING_SAVE_LABEL,
  BUAT_HEADING,
  BUAT_INTRO,
  BUAT_SECTION_DATA,
  BUAT_SECTION_BARANG,
  BUAT_SECTION_REKENING,
  CTA_BUAT_TAGIHAN,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_REKENING_LABEL,
  PAYMENT_METHOD_QRIS_LABEL,
  QRIS_UPLOAD_LABEL,
  QRIS_UPLOAD_HINT,
} from '@/lib/copy';

// Seller-first invoice form. The proposer is always PENJUAL (hidden field
// below) and every deal is created GRATIS — the role selector and tier
// selector are both gone, and app/buat/actions.ts enforces PENJUAL-only at
// the data layer (§22), so neither is a UI-only assumption.
//
// §27 (2026-07-21): moved onto the shared UI kit. This page had drifted into
// its own look — its own container, its own card treatment, its own input
// classes, a bare `bg-white` while nothing else used one. It now renders the
// same primitives as every other screen and picks up the tablet/desktop
// treatment from PageShell rather than being a phone layout stretched wide.

function SubmitButton({ allChecked }: { allChecked: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={!allChecked || pending} className={buttonClass.primary}>
      {pending ? <PendingContent label={PENDING_SAVE_LABEL} /> : CTA_BUAT_TAGIHAN}
    </button>
  );
}

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-4">
        <SectionLabel>{label}</SectionLabel>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </Card>
  );
}

function formatNominal(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

const NOMINAL_PLACEHOLDER = (1000000).toLocaleString('id-ID');

const initialState: CreateDealState = {};

export default function BuatPage() {
  const [state, formAction] = useActionState(createDeal, initialState);
  const [tcChecked, setTcChecked] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'REKENING' | 'QRIS'>('REKENING');
  const [qrisFileName, setQrisFileName] = useState('');
  const [bank, setBank] = useState('');
  const [customBank, setCustomBank] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [itemDetail, setItemDetail] = useState('');
  const [nominalDisplay, setNominalDisplay] = useState('');
  const [rawNominal, setRawNominal] = useState('');
  const [rekening, setRekening] = useState('');
  const [history, setHistory] = useState<AccountHistoryDisplay>({ status: 'idle' });
  const [proposerPhone, setProposerPhone] = usePersistedPhone();
  const effectiveBank = bank === BANK_OTHER_VALUE ? customBank : bank;

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
    <PageShell>
      <PageTitle title={BUAT_HEADING} subtitle={BUAT_INTRO} />

      <form action={formAction} className="flex flex-col gap-4">
        {state.error && <ErrorBanner>{state.error}</ErrorBanner>}

        <FormSection label={BUAT_SECTION_DATA}>
          <Field
            label={PHONE_FIELD_LABEL}
            htmlFor="proposer_phone"
            hint={PHONE_FORMAT_HINT}
            error={fe.proposer_phone}
          >
            <input
              id="proposer_phone"
              name="proposer_phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={proposerPhone}
              onChange={(e) => setProposerPhone(e.target.value)}
              className={inputClass}
            />
          </Field>

          <input type="hidden" name="proposer_role" value="PENJUAL" />
        </FormSection>

        <FormSection label={BUAT_SECTION_BARANG}>
          <Field label={ITEM_TITLE_LABEL} htmlFor="item_title" error={fe.item_title}>
            <input
              id="item_title"
              name="item_title"
              type="text"
              maxLength={80}
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              placeholder={ITEM_TITLE_PLACEHOLDER}
              className={inputClass}
            />
            <p className="mt-1 text-right text-xs text-zinc-400">{itemTitle.length}/80</p>
          </Field>

          <Field label={ITEM_DETAIL_LABEL} htmlFor="item_detail" error={fe.item_detail}>
            <textarea
              id="item_detail"
              name="item_detail"
              rows={3}
              maxLength={400}
              value={itemDetail}
              onChange={(e) => setItemDetail(e.target.value)}
              placeholder={ITEM_DETAIL_PLACEHOLDER}
              className={inputClass}
            />
            <p className="mt-1 text-right text-xs text-zinc-400">{itemDetail.length}/400</p>
          </Field>

          <Field label="Nominal (Rp)" htmlFor="amount_display" error={fe.amount_idr}>
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
              className={inputClass}
            />
            <input type="hidden" name="amount_idr" value={rawNominal} />
          </Field>

        </FormSection>

        <FormSection label={BUAT_SECTION_REKENING}>
          <Field label={PAYMENT_METHOD_LABEL} htmlFor="payment_method_rekening">
            <div className="flex gap-4 text-sm text-zinc-700">
              <label className="flex items-center gap-2">
                <input
                  id="payment_method_rekening"
                  type="radio"
                  name="payment_method"
                  value="REKENING"
                  checked={paymentMethod === 'REKENING'}
                  onChange={() => setPaymentMethod('REKENING')}
                  className="accent-[var(--witness)]"
                />
                {PAYMENT_METHOD_REKENING_LABEL}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="payment_method"
                  value="QRIS"
                  checked={paymentMethod === 'QRIS'}
                  onChange={() => setPaymentMethod('QRIS')}
                  className="accent-[var(--witness)]"
                />
                {PAYMENT_METHOD_QRIS_LABEL}
              </label>
            </div>
          </Field>

          {paymentMethod === 'REKENING' && (
            <>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="sm:flex-1">
                  <Field label="Bank" htmlFor="rekening_bank_select" error={fe.rekening_bank}>
                    <select
                      id="rekening_bank_select"
                      value={bank}
                      onChange={(e) => setBank(e.target.value)}
                      className={inputClass}
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
                        className={`mt-2 ${inputClass}`}
                      />
                    )}
                    <input type="hidden" name="rekening_bank" value={effectiveBank} />
                  </Field>
                </div>
                <div className="sm:flex-[2]">
                  <Field
                    label="Nomor rekening tujuan pembayaran"
                    htmlFor="rekening_tujuan"
                    error={fe.rekening_tujuan}
                  >
                    <input
                      id="rekening_tujuan"
                      name="rekening_tujuan"
                      type="text"
                      inputMode="numeric"
                      value={rekening}
                      onChange={(e) => setRekening(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>

              {history.status !== 'idle' && (
                <p className="text-xs leading-relaxed text-zinc-500">
                  {history.status === 'found' &&
                    formatAccountHistory(
                      effectiveBank,
                      history.rekeningMasked,
                      history.berhasilCount,
                      history.klaimBarangCount,
                      history.belumDikonfirmasiCount,
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

          {paymentMethod === 'QRIS' && (
            <Field label={QRIS_UPLOAD_LABEL} htmlFor="qris_image" hint={QRIS_UPLOAD_HINT} error={fe.qris_image}>
              <input
                id="qris_image"
                name="qris_image"
                type="file"
                accept="image/*"
                onChange={(e) => setQrisFileName(e.target.files?.[0]?.name ?? '')}
                className={inputClass}
              />
              {qrisFileName && <p className="mt-1 text-xs text-zinc-500">{qrisFileName}</p>}
              {/* No live history preview here (unlike the rekening path above) — the
                  seller's QRIS identity is only known once the server decodes the
                  upload, which happens on submit, not as-you-type. History for this
                  merchant is still shown to the buyer on the deal page and on /cek,
                  same as rekening — this form just doesn't preview it before submit. */}
            </Field>
          )}
        </FormSection>

        <input type="hidden" name="tier" value="GRATIS" />

        <Card>
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-zinc-800">Pernyataan</legend>
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-xs leading-relaxed text-zinc-500">
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
                className="mt-0.5 shrink-0 accent-[var(--witness)]"
              />
              <TCLabel />
            </label>
            <PrivacyLink />
          </fieldset>
        </Card>

        <SubmitButton allChecked={tcChecked} />
      </form>
    </PageShell>
  );
}
