import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { DealStatus } from '@/lib/db/transitions';
import { DealShareButton } from './DealShareButton';
import { JoinDealForm } from './JoinDealForm';
import { AcceptDealForm } from './AcceptDealForm';
import { joinDeal, acceptDeal } from './actions';
import {
  JOIN_FORM_HEADING,
  JOIN_DEAL_INSTRUCTION,
  STATUS_DIAJUKAN,
  STATUS_DISEPAKATI_PLACEHOLDER,
  ROLE_LABELS,
  ROLE_PAIR,
  COUNTERPART_FALLBACK_LABEL,
  TIER_LABELS,
} from '@/lib/copy';

function formatRp(amount: number | bigint): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(amount));
}

function formatDate(iso: string): string {
  // Date-only strings parse as UTC midnight. Render explicitly in WIB so the
  // displayed calendar date is correct regardless of the server's default TZ.
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = supabaseServer();

  const { data: deal } = await db
    .from('deals')
    .select('*')
    .eq('token', token)
    .single();

  if (
    !deal ||
    ![DealStatus.DRAF, DealStatus.DIAJUKAN, DealStatus.DISEPAKATI].includes(deal.status)
  ) {
    notFound();
  }

  const counterpartRoleKey = ROLE_PAIR[deal.proposer_role];
  const counterpartRoleLabel = counterpartRoleKey
    ? (ROLE_LABELS[counterpartRoleKey] ?? COUNTERPART_FALLBACK_LABEL)
    : COUNTERPART_FALLBACK_LABEL;

  const shareUrl = `https://saksi.app/deal/${token}`;

  const boundJoinDeal = joinDeal.bind(null, token);
  const boundAcceptDeal = acceptDeal.bind(null, token);

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <a href="/" className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-800">
          ← SAKSI
        </a>

        {/* Deal summary card */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Ringkasan Kesepakatan
          </p>
          <p className="mb-1 text-base font-medium text-zinc-900">{deal.item_desc}</p>
          <div className="mt-3 flex flex-col gap-1 text-sm text-zinc-600">
            <p>
              <span className="font-medium">Nominal:</span> {formatRp(deal.amount_idr)}
            </p>
            <p>
              <span className="font-medium">Rekening tujuan:</span> {deal.rekening_bank}{' '}
              {deal.rekening_tujuan}
            </p>
            <p>
              <span className="font-medium">Batas waktu:</span> {formatDate(deal.deadline)}
            </p>
            <p>
              <span className="font-medium">Peran pengaju:</span>{' '}
              {ROLE_LABELS[deal.proposer_role] ?? deal.proposer_role}
            </p>
            <p>
              <span className="font-medium">Peran pihak penerima:</span>{' '}
              {counterpartRoleLabel}
            </p>
            <p>
              <span className="font-medium">Tier:</span>{' '}
              {TIER_LABELS[deal.tier] ?? deal.tier}
            </p>
          </div>
        </div>

        {deal.status === DealStatus.DRAF && (
          <>
            {/* Share section */}
            <div className="mb-6 rounded-xl border border-zinc-200 p-5">
              <p className="mb-2 text-sm font-medium text-zinc-700">
                Bagikan link ini kepada pihak lain:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-800">
                  {shareUrl}
                </code>
                <DealShareButton url={shareUrl} />
              </div>
            </div>

            {/* Counterpart entry form */}
            <div className="rounded-xl border border-zinc-200 p-5">
              <p className="mb-1 text-sm font-semibold text-zinc-900">
                {JOIN_FORM_HEADING}
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                {JOIN_DEAL_INSTRUCTION}
              </p>
              <JoinDealForm action={boundJoinDeal} />
            </div>
          </>
        )}

        {deal.status === DealStatus.DIAJUKAN && (
          <>
            <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
              {STATUS_DIAJUKAN}
            </div>

            <div className="rounded-xl border border-zinc-200 p-5">
              <p className="mb-4 text-sm font-semibold text-zinc-900">
                {JOIN_FORM_HEADING}
              </p>
              <AcceptDealForm action={boundAcceptDeal} />
            </div>
          </>
        )}

        {deal.status === DealStatus.DISEPAKATI && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
            {STATUS_DISEPAKATI_PLACEHOLDER}
          </div>
        )}
      </div>
    </div>
  );
}
