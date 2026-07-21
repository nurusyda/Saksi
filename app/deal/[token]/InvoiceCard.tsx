import { formatRp, formatDate } from '@/lib/format';
import { maskRekening } from '@/lib/db/accountHistory';
import {
  INVOICE_EYEBROW,
  INVOICE_WITNESS_MARK,
  INVOICE_LOCKED_NOTE,
  INVOICE_NUMBER_LABEL,
  INVOICE_FOR_LABEL,
  REKENING_TUJUAN_LABEL,
} from '@/lib/copy';

// §23 — the deal summary re-presented as a tagihan.
//
// Same data the old summary card showed, same masking rule (rekening stays
// masked here: this renders for anyone holding the link, before any party
// identity is confirmed — the full number only appears post-identification in
// DisepakatiPanel). The change is presentation only: a buyer who was sent a
// payment link should recognise the thing in front of them as an invoice, not
// as a form they are being asked to fill in.
//
// Deliberately NOT here: any status, verdict, or reassurance. The account's
// record is surfaced separately, next to the rekening at the moment of
// payment, by PaymentForm — an invoice must never look like a vouch.
export function InvoiceCard({
  itemDesc,
  amountIdr,
  deadline,
  token,
  rekeningBank,
  rekeningTujuan,
  kategoriLabel,
}: {
  itemDesc: string;
  amountIdr: number;
  deadline: string;
  token: string;
  rekeningBank?: string | null;
  rekeningTujuan?: string | null;
  kategoriLabel?: string | null;
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
            {INVOICE_EYEBROW}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{INVOICE_LOCKED_NOTE}</p>
        </div>
        {kategoriLabel && (
          <span className="shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-bold text-zinc-600">
            {kategoriLabel}
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        <p className="text-sm text-zinc-500">{INVOICE_FOR_LABEL}</p>
        <p className="mb-3 mt-0.5 text-base font-bold leading-snug text-zinc-900">{itemDesc}</p>

        <p className="text-3xl font-extrabold tracking-tight text-zinc-900">
          {formatRp(amountIdr)}
        </p>

        <dl className="mt-4 flex flex-col">
          <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-2 text-sm">
            <dt className="text-zinc-600">Batas waktu</dt>
            <dd className="text-right font-semibold text-zinc-900">{formatDate(deadline)}</dd>
          </div>
          {rekeningBank && rekeningTujuan && (
            <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-2 text-sm">
              <dt className="text-zinc-600">{REKENING_TUJUAN_LABEL}</dt>
              <dd className="text-right font-semibold text-zinc-900">
                {rekeningBank} {maskRekening(rekeningTujuan)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-2 text-sm">
            <dt className="text-zinc-600">{INVOICE_NUMBER_LABEL}</dt>
            <dd className="text-right font-semibold text-zinc-900">SAKSI-{token}</dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-zinc-200 bg-witness-soft px-5 py-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-witness">
          <span aria-hidden="true">👁</span>
          {INVOICE_WITNESS_MARK}
        </p>
      </div>
    </div>
  );
}
