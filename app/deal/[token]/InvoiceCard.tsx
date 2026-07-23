import { formatRp, formatDeadlineWib } from '@/lib/format';
import { maskRekening } from '@/lib/db/accountHistory';
import { CopyAmountButton } from './CopyAmountButton';
import {
  INVOICE_EYEBROW,
  INVOICE_WITNESS_MARK,
  INVOICE_LOCKED_NOTE,
  INVOICE_NUMBER_LABEL,
  INVOICE_FOR_LABEL,
  REKENING_TUJUAN_LABEL,
  QRIS_MERCHANT_NAME_LABEL,
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
  qrisMerchantName,
  kategoriLabel,
}: {
  itemDesc: string;
  amountIdr: number;
  deadline: string;
  token: string;
  rekeningBank?: string | null;
  rekeningTujuan?: string | null;
  qrisMerchantName?: string | null;
  kategoriLabel?: string | null;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* §27 — one line, not a stacked block. The eyebrow, the locked-link
          note and the kategori chip are all chrome; giving them two rows of
          their own pushed the amount (the only thing a buyer scans for)
          further down every screen. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-200 px-4 py-2.5 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">
          {INVOICE_EYEBROW}
        </p>
        <span aria-hidden="true" className="text-zinc-300">·</span>
        <p className="text-[11px] text-zinc-500">{INVOICE_LOCKED_NOTE}</p>
        {kategoriLabel && (
          <span className="ml-auto shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-bold text-zinc-600">
            {kategoriLabel}
          </span>
        )}
      </div>

      <div className="px-4 py-3.5 sm:px-5">
        {/* §36 — "Untuk" and the item were 11px/sm against a 2xl nominal, so
            what the buyer is paying FOR read as a caption on what they are
            paying. They are not a label and a headline; they are two halves
            of the same fact. Item is up to base and the eyebrow to xs, which
            closes the gap without letting the item outweigh the nominal. */}
        <p className="text-xs font-semibold text-zinc-500">{INVOICE_FOR_LABEL}</p>
        <p className="mb-2 mt-1 text-base font-bold leading-snug text-zinc-900 sm:text-lg">
          {itemDesc}
        </p>

        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-extrabold tracking-tight text-zinc-900">
            {formatRp(amountIdr)}
          </p>
          <CopyAmountButton amountIdr={amountIdr} />
        </div>

        <dl className="mt-2.5 flex flex-col">
          <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-1.5 text-xs">
            <dt className="shrink-0 text-zinc-600">Batas waktu</dt>
            {/* The exact instant the window closes, not a bare date — see
                formatDeadlineWib for why 23.59 is the true cutoff. */}
            <dd className="text-right font-semibold text-zinc-900">{formatDeadlineWib(deadline)}</dd>
          </div>
          {rekeningBank && rekeningTujuan && (
            <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-1.5 text-xs">
              <dt className="text-zinc-600">{REKENING_TUJUAN_LABEL}</dt>
              <dd className="text-right font-semibold text-zinc-900">
                {rekeningBank} {maskRekening(rekeningTujuan)}
              </dd>
            </div>
          )}
          {qrisMerchantName && (
            <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-1.5 text-xs">
              <dt className="text-zinc-600">{QRIS_MERCHANT_NAME_LABEL}</dt>
              <dd className="text-right font-semibold text-zinc-900">{qrisMerchantName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-dashed border-zinc-200 py-1.5 text-xs">
            <dt className="text-zinc-600">{INVOICE_NUMBER_LABEL}</dt>
            <dd className="text-right font-semibold text-zinc-900">SAKSI-{token}</dd>
          </div>
        </dl>
      </div>

      <div className="border-t border-zinc-200 bg-witness-soft px-4 py-2 sm:px-5">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-witness">
          <span aria-hidden="true">👁</span>
          {INVOICE_WITNESS_MARK}
        </p>
      </div>
    </div>
  );
}
