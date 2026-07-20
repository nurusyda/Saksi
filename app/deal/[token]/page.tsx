import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { DealStatus } from '@/lib/db/transitions';
import { DealLinkCard } from './DealLinkCard';
import { DealProgressStepper } from './DealProgressStepper';
import { JoinDealForm } from './JoinDealForm';
import { AcceptDealForm } from './AcceptDealForm';
import { DisepakatiPanel } from './DisepakatiPanel';
import { DibayarDiklaimPanel } from './DibayarDiklaimPanel';
import { DikonfirmasiTerimaPanel } from './DikonfirmasiTerimaPanel';
import { SelesaiPanel } from './SelesaiPanel';
import { joinDeal, acceptDeal } from './actions';
import { formatRp, formatDate } from '@/lib/format';
import { maskRekening } from '@/lib/db/accountHistory';
import {
  JOIN_FORM_HEADING,
  JOIN_DEAL_INSTRUCTION,
  STATUS_DIAJUKAN,
  ROLE_LABELS,
  ROLE_PAIR,
  COUNTERPART_FALLBACK_LABEL,
  TIER_LABELS,
} from '@/lib/copy';

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
    ![
      DealStatus.DRAF,
      DealStatus.DIAJUKAN,
      DealStatus.DISEPAKATI,
      DealStatus.DIBAYAR_DIKLAIM,
      DealStatus.DIKONFIRMASI_TERIMA,
      DealStatus.SELESAI,
    ].includes(deal.status)
  ) {
    notFound();
  }

  // Defense in depth: migration 0013's CHECK constraint guarantees
  // rekening_tujuan/rekening_bank are non-null once a deal leaves DRAF, but
  // `deal` here is untyped (select('*') with no generated Database schema)
  // so TypeScript can't catch a drift between the constraint and this
  // assumption. DisepakatiPanel and friends are typed to expect non-null
  // strings for these fields.
  if (deal.status !== DealStatus.DRAF && (!deal.rekening_tujuan || !deal.rekening_bank)) {
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

        <DealProgressStepper status={deal.status} />

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
            {/* Masked — this card renders for anyone with the link, before
                any party identity is confirmed. Full number only appears
                post-identification (DisepakatiPanel and friends). */}
            {deal.rekening_tujuan && deal.rekening_bank && (
              <p>
                <span className="font-medium">Rekening tujuan:</span> {deal.rekening_bank}{' '}
                {maskRekening(deal.rekening_tujuan)}
              </p>
            )}
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

        {/* Persistent deal link — every status, not just DRAF (UX-audit fix:
            identity is phone-only with no session, so this URL is the only
            way back into the deal; a party who loses it has no recovery
            path). Omitted at SELESAI: the deal is closed and re-access is no
            longer time-sensitive. */}
        {deal.status !== DealStatus.SELESAI && (
          <DealLinkCard url={shareUrl} itemDesc={deal.item_desc} />
        )}

        {deal.status === DealStatus.DRAF && (
          <>
            {/* Counterpart entry form */}
            <div className="rounded-xl border border-zinc-200 p-5">
              <p className="mb-1 text-sm font-semibold text-zinc-900">
                {JOIN_FORM_HEADING}
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                {JOIN_DEAL_INSTRUCTION}
              </p>
              <JoinDealForm action={boundJoinDeal} needsRekening={deal.proposer_role === 'PEMBELI'} />
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
          <DisepakatiPanel
            deal={{
              token,
              item_desc: deal.item_desc,
              amount_idr: Number(deal.amount_idr),
              proposer_role: deal.proposer_role,
            }}
          />
        )}

        {deal.status === DealStatus.DIBAYAR_DIKLAIM && (
          <DibayarDiklaimPanel deal={{ token, proposer_role: deal.proposer_role }} />
        )}

        {deal.status === DealStatus.DIKONFIRMASI_TERIMA && (
          <DikonfirmasiTerimaPanel
            deal={{ token, item_desc: deal.item_desc, proposer_role: deal.proposer_role }}
          />
        )}

        {deal.status === DealStatus.SELESAI && <SelesaiPanel token={token} />}
      </div>
    </div>
  );
}
