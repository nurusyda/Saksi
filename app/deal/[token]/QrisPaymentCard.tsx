import {
  QRIS_SCAN_INSTRUCTION,
  QRIS_MERCHANT_NAME_LABEL,
  QRIS_MERCHANT_CITY_LABEL,
} from '@/lib/copy';

// Parallel to RekeningCopyCard, for a QRIS-payment-method deal (migration
// 0036). No account number exists to copy here — the seller's QRIS
// abstracts their settlement account away entirely — so this shows the
// scannable code plus the merchant identity decoded from it, and the
// account's record renders inside it exactly like RekeningCopyCard's
// `children` slot, same forced-check-before-trust structure.
export function QrisPaymentCard({
  merchantName,
  merchantCity,
  imageUrl,
  children,
}: {
  merchantName: string;
  merchantCity?: string | null;
  imageUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 px-4 py-2.5 sm:px-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400">QRIS</p>
      </div>

      <div className="px-4 py-3.5 sm:px-5">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL, not a static asset next/image can optimize
          <img
            src={imageUrl}
            alt={QRIS_SCAN_INSTRUCTION}
            className="mx-auto h-56 w-56 rounded-xl border border-zinc-200 object-contain"
          />
        ) : (
          <p className="text-sm text-zinc-500">{QRIS_SCAN_INSTRUCTION}</p>
        )}

        <p className="mt-3 text-xs font-semibold text-zinc-500">{QRIS_MERCHANT_NAME_LABEL}</p>
        <p className="text-lg font-extrabold tracking-tight text-zinc-900">{merchantName}</p>
        {merchantCity && (
          <p className="mt-0.5 text-xs text-zinc-500">
            {QRIS_MERCHANT_CITY_LABEL}: {merchantCity}
          </p>
        )}

        <p className="mt-2 text-xs leading-relaxed text-zinc-600">{QRIS_SCAN_INSTRUCTION}</p>

        {/* The account's record — server-rendered by the parent, passed in as
            children so it sits inside this card rather than floating beside
            it, same structural forced-check as RekeningCopyCard. */}
        <div className="mt-3 border-t border-zinc-100 pt-3">{children}</div>
      </div>
    </div>
  );
}
