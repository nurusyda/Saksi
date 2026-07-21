import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { DealStatus } from '@/lib/db/transitions';
import { DealLinkCard } from './DealLinkCard';
import { DealProgress } from './DealProgress';
import { InvoiceCard } from './InvoiceCard';
import { BuyerJoinGate } from './BuyerJoinGate';
import { RememberDeal } from './RememberDeal';
import { DibayarDiklaimPanel } from './DibayarDiklaimPanel';
import { DikonfirmasiTerimaPanel } from './DikonfirmasiTerimaPanel';
import { TidakDipenuhiPanel } from './TidakDipenuhiPanel';
import { SelesaiPanel } from './SelesaiPanel';
import { DibatalkanBersamaPanel } from './DibatalkanBersamaPanel';
import { TidakDilanjutkanPanel } from './TidakDilanjutkanPanel';
import { KedaluwarsaPanel } from './KedaluwarsaPanel';
import { DikembalikanPenuhPanel } from './DikembalikanPenuhPanel';
import { DikembalikanSebagianPanel } from './DikembalikanSebagianPanel';
import { WaitingStatusPoll } from './WaitingStatusPoll';
import { joinAndPay } from './actions';
import { submitBuktiFromForm } from './paymentActions';
import { getPartySession } from '@/lib/db/partySession';
import { PageShell, SplitLayout, Card } from '@/components/ui';
import {
  STATUS_DIAJUKAN,
  ROLE_LABELS,
  ROLE_PAIR,
  ERROR_REKENING_LOAD_FAILED,
  WAITING_FOR_PAYMENT_PROOF,
} from '@/lib/copy';

const TERMINAL_STATUSES: string[] = [
  DealStatus.SELESAI,
  DealStatus.TIDAK_DIPENUHI,
  DealStatus.SENGKETA,
  DealStatus.DIBATALKAN_BERSAMA,
  DealStatus.TIDAK_DILANJUTKAN,
  DealStatus.KEDALUWARSA,
  DealStatus.DIKEMBALIKAN_PENUH,
  DealStatus.DIKEMBALIKAN_SEBAGIAN,
];

// Link-preview metadata (2026-07-21) — when a deal link is pasted into WA,
// the preview card previously fell back to the root layout's generic
// "SAKSI" title, giving the recipient no idea what they were opening.
// item_desc is already a public-safe deals_public column (data-model.md),
// same exposure category as what /cek and the flag pages already show — no
// new disclosure here, just surfacing it earlier in the flow. Own minimal
// query (not the full row the page component fetches below) since
// generateMetadata runs as a separate function pass with its own params.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const db = supabaseServer();
  const { data: deal } = await db
    .from('deals')
    .select('item_desc, status')
    .eq('token', token)
    .single();

  if (!deal) return {};

  const title = `Kesepakatan: ${deal.item_desc}`;
  const description = TERMINAL_STATUSES.includes(deal.status)
    ? 'Kesepakatan telah selesai. Klik untuk melihat catatan di SAKSI.'
    : deal.status === DealStatus.DRAF
      ? 'Diajukan. Klik untuk menyepakati di SAKSI.'
      : 'Kesepakatan sedang berjalan. Klik untuk melihat status di SAKSI.';

  return { title, description, openGraph: { title, description } };
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
    ![
      DealStatus.DRAF,
      DealStatus.DIAJUKAN,
      DealStatus.DISEPAKATI,
      DealStatus.DIBAYAR_DIKLAIM,
      DealStatus.DIKONFIRMASI_TERIMA,
      DealStatus.TIDAK_DIPENUHI,
      DealStatus.SENGKETA,
      DealStatus.SELESAI,
      DealStatus.DIBATALKAN_BERSAMA,
      DealStatus.TIDAK_DILANJUTKAN,
      DealStatus.KEDALUWARSA,
      DealStatus.DIKEMBALIKAN_PENUH,
      DealStatus.DIKEMBALIKAN_SEBAGIAN,
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

  // §23: counterpartRoleLabel retired with the old summary card — the invoice
  // no longer prints both roles. counterpartRoleKey stays: viewerRoleLabel
  // below still needs it to name the viewer's own side.
  const counterpartRoleKey = ROLE_PAIR[deal.proposer_role];

  const shareUrl = `https://saksi.app/deal/${token}`;

  // Detect whether the viewer is the proposer (cookie set by createDeal).
  // Without sessions, this is a best-effort signal: it works for the
  // proposer's current browser, doesn't survive cross-device or clearing
  // cookies, and a miss harmlessly shows the join form anyway.
  const cookieStore = await cookies();
  const isProposer = cookieStore.get(`saksi_proposer_${token}`)?.value === '1';

  // Short-lived party-session cookie (see partySession.ts) — lets whichever
  // party already identified themselves on this deal (via accept or an
  // earlier IdentifyPartyGate submission) skip re-typing their phone on the
  // next status screen, within the same browser and a ~45-minute window.
  const partySession = await getPartySession(token);

  // Role auto-display (2026-07-20): derive the viewer's own role from the
  // party-session cookie + the deal's known role pair — no new cookie, no new
  // DB query. Cold visitors (no session) see nothing.
  const viewerRoleKey =
    partySession === 'proposer'
      ? deal.proposer_role
      : partySession === 'counterpart'
        ? counterpartRoleKey
        : null;
  const viewerRoleLabel = viewerRoleKey ? ROLE_LABELS[viewerRoleKey] ?? viewerRoleKey : null;

  const boundJoinAndPay = joinAndPay.bind(null, token);
  const boundSubmitBukti = submitBuktiFromForm.bind(null, token);

  // §23/§26 — event times for DealProgress. Queried here rather than fetched
  // client-side so the timestamps are present in the first paint (no flash of
  // a timeline with no times). deal_events carries no PII (0001's RLS notes),
  // and this selects only the two columns the stepper renders.
  const { data: progressEvents } = await db
    .from('deal_events')
    .select('event, created_at')
    .eq('deal_id', deal.id)
    .order('id', { ascending: true });

  // §26: the deal-link card is the seller's tool — it exists so whoever
  // created the tagihan can re-share or re-save the capability URL. Showing
  // it to the buyer put "Link tagihan ini / Simpan link ini" in the middle
  // of the payment flow, which is noise: the buyer arrived *via* that link
  // and is not the one who needs to distribute it.
  const showLinkCard =
    isProposer &&
    ![
      DealStatus.SELESAI,
      DealStatus.DIBATALKAN_BERSAMA,
      DealStatus.TIDAK_DILANJUTKAN,
      DealStatus.KEDALUWARSA,
      DealStatus.DIKEMBALIKAN_PENUH,
      DealStatus.DIKEMBALIKAN_SEBAGIAN,
    ].includes(deal.status);

  const main = (
    <>
      {/* §32 — seller-side only: records this tagihan into the creator's own
          browser list so /saya can find it if the link is lost. Renders
          nothing; gated on the proposer cookie so a buyer never accumulates
          the seller's deals. */}
      {isProposer && (
        <RememberDeal
          token={token}
          itemDesc={deal.item_desc}
          amountIdr={Number(deal.amount_idr)}
        />
      )}

      <DealProgress status={deal.status} events={progressEvents ?? []} />

        {/* §23 — the summary is now presented as a tagihan. Same fields, same
            masking rule; the two "Peran ..." lines are dropped because the
            flow is seller-only and enforced as such at the data layer (§22),
            so both roles are already implied by the invoice itself. */}
        <InvoiceCard
          itemDesc={deal.item_desc}
          amountIdr={Number(deal.amount_idr)}
          deadline={deal.deadline}
          token={token}
          rekeningBank={deal.rekening_bank}
          rekeningTujuan={deal.rekening_tujuan}
        />
        {/* No kategori badge: the mockup's Reguler/PO chip has no column
            behind it (deal-type gating was removed, §6a) and the deadline is
            auto-derived at creation. Faking the chip would put a label on the
            invoice that nothing in the record supports. */}

        {/* Role auto-display (2026-07-20): visible only when the party-session
            cookie identifies the viewer as one of the two parties. */}
        {viewerRoleLabel && (
          <p className="mb-4 text-sm font-semibold text-zinc-600">Anda: {viewerRoleLabel}</p>
        )}

        {deal.status === DealStatus.DRAF && (
          <>
            {isProposer ? (
              <Card className="bg-zinc-50 text-sm text-zinc-700">
                <p>Menunggu pembeli membuka tagihan dan bergabung. Bagikan link di bawah.</p>
                <WaitingStatusPoll token={token} knownStatus={DealStatus.DRAF} />
              </Card>
            ) : (
              /* §31 — the whole buyer page: account + record + copy, then
                 phone + bukti in one submit. Rendered only when the deal
                 actually has a rekening; createDeal requires one for PENJUAL
                 (the only proposer role since §22), so the fallback below is
                 defensive rather than a live branch. */
              deal.rekening_bank && deal.rekening_tujuan ? (
                <BuyerJoinGate
                  token={token}
                  action={boundJoinAndPay}
                  rekeningBank={deal.rekening_bank}
                  rekeningTujuan={deal.rekening_tujuan}
                />
              ) : (
                <Card className="bg-zinc-50 text-sm text-zinc-700">
                  <p>{ERROR_REKENING_LOAD_FAILED}</p>
                </Card>
              )
            )}
          </>
        )}

        {/* 2026-07-20: DIAJUKAN is no longer a resting state in the normal
            flow — join_deal_with_event (migration 0025) now finalizes
            DISEPAKATI atomically inside the same transaction as
            COUNTERPART_JOINED, folding the old separate accept step away
            entirely (attestations already happened at create/join, so it
            collected no new consent). Left as a defensive fallback only,
            in case any pre-migration row is still sitting in this status. */}
        {deal.status === DealStatus.DIAJUKAN && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
            {STATUS_DIAJUKAN}
          </div>
        )}

        {/* §37 — the buyer sees ONE page, at DRAF and at DISEPAKATI alike:
            rekening + record + copy, then phone + bukti. Previously
            DISEPAKATI rendered a second, phone-less upload form behind
            IdentifyPartyGate, so any buyer who landed here (which happened
            whenever the one-shot join+pay could not finish the claim) met
            what looked like the same page asking for the same thing twice.
            The phone field is what identifies the submitter — there is no
            session — so keeping it is what lets that second screen go.

            Payer vs payee is decided by the proposer cookie, the same
            heuristic the DRAF branch above already uses. A seller on a
            device without that cookie sees the pay form and is rejected
            server-side (ERROR_WRONG_PARTY_PEMBELI_ONLY); that is the same
            behaviour DRAF has always had, not a new gap. */}
        {deal.status === DealStatus.DISEPAKATI &&
          (isProposer ? (
            <Card className="bg-zinc-50 text-sm text-zinc-700">
              <p>{WAITING_FOR_PAYMENT_PROOF}</p>
              <WaitingStatusPoll token={token} knownStatus={DealStatus.DISEPAKATI} />
            </Card>
          ) : deal.rekening_bank && deal.rekening_tujuan ? (
            <BuyerJoinGate
              token={token}
              action={boundSubmitBukti}
              rekeningBank={deal.rekening_bank}
              rekeningTujuan={deal.rekening_tujuan}
              mode="pay"
            />
          ) : (
            <Card className="bg-zinc-50 text-sm text-zinc-700">
              <p>{ERROR_REKENING_LOAD_FAILED}</p>
            </Card>
          ))}

        {deal.status === DealStatus.DIBAYAR_DIKLAIM && (
          <DibayarDiklaimPanel
            deal={{ token, proposer_role: deal.proposer_role, item_desc: deal.item_desc, deadline: deal.deadline }}
            initialWhichParty={partySession}
          />
        )}

        {deal.status === DealStatus.DIKONFIRMASI_TERIMA && (
          <DikonfirmasiTerimaPanel
            deal={{ token, item_desc: deal.item_desc, proposer_role: deal.proposer_role }}
            initialWhichParty={partySession}
          />
        )}

        {(deal.status === DealStatus.TIDAK_DIPENUHI || deal.status === DealStatus.SENGKETA) && (
          <TidakDipenuhiPanel
            deal={{ token, item_desc: deal.item_desc, proposer_role: deal.proposer_role, status: deal.status }}
            initialWhichParty={partySession}
          />
        )}

        {deal.status === DealStatus.SELESAI && <SelesaiPanel token={token} />}

        {deal.status === DealStatus.DIBATALKAN_BERSAMA && <DibatalkanBersamaPanel token={token} />}
        {deal.status === DealStatus.TIDAK_DILANJUTKAN && <TidakDilanjutkanPanel token={token} />}
        {deal.status === DealStatus.KEDALUWARSA && <KedaluwarsaPanel token={token} />}
        {deal.status === DealStatus.DIKEMBALIKAN_PENUH && <DikembalikanPenuhPanel token={token} />}
        {deal.status === DealStatus.DIKEMBALIKAN_SEBAGIAN && <DikembalikanSebagianPanel token={token} />}
    </>
  );

  return (
    <PageShell wide={showLinkCard}>
      {showLinkCard ? (
        <SplitLayout
          main={main}
          rail={<DealLinkCard url={shareUrl} itemDesc={deal.item_desc} />}
        />
      ) : (
        main
      )}
    </PageShell>
  );
}
