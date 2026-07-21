'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { getPartyPhone, type WhichParty } from '@/lib/db/party';
import { setPartySession } from '@/lib/db/partySession';
import { SYARAT_KETENTUAN_VERSION, SYARAT_KETENTUAN_HASH } from '@/lib/legal';
import { sendWaMessage } from '@/lib/wa/send';
import {
  ERROR_ATTESTATIONS_REQUIRED,
  ERROR_SELF_JOIN,
  ERROR_PHONE_INVALID,
  ERROR_PARTY_SAVE_FAILED,
  ERROR_JOIN_FAILED,
  ERROR_DEAL_NOT_FOUND,
  ERROR_DEAL_CLOSED,
  formatDisepakatiMessage,
} from '@/lib/copy';

// Best-effort turn-taking WA nudge (UX-audit fix pass, 2026-07-20,
// copy-id.md §9b). Never awaited by callers with a blocking `await` on its
// result and never allowed to fail the transition it's attached to —
// sendWaMessage already swallows its own errors (returns {sent: false}
// rather than throwing), so this is a thin fetch-phone-then-send wrapper,
// not a retry/queue mechanism.
async function notifyTurn(
  db: ReturnType<typeof supabaseServer>,
  partyId: string | null,
  template: 'DISEPAKATI',
  message: string,
): Promise<void> {
  const phone = await getPartyPhone(db, partyId);
  if (!phone) return;
  void sendWaMessage({ toPhoneE164: phone, template, params: { message } });
}

export type JoinDealState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

// joinDeal — 2026-07-20 design (see data-model.md): folds the old separate
// DIAJUKAN "accept" step into this action. Attestations already happen here
// (counterpart) and at createDeal (proposer) — the old accept step collected
// zero new consent, just a second phone re-entry to click "Setuju" twice.
// The counterpart's join now atomically fires COUNTERPART_JOINED then
// ACCEPTED in one transaction: DRAF -> DISEPAKATI directly, no manual accept
// from either party, no DIAJUKAN resting state in the normal path.
export async function joinDeal(
  token: string,
  _prev: JoinDealState,
  formData: FormData,
): Promise<JoinDealState> {
  const db = supabaseServer();

  // Load and verify deal is still in DRAF — earliest possible gate
  const { data: deal, error: dealErr } = await db
    .from('deals')
    .select('*')
    .eq('token', token)
    .single();

  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DRAF)
    return { error: ERROR_DEAL_CLOSED };

  // Attestation gate — the four pernyataan (displayed as fine print above the
  // T&C checkbox) are covered by the single T&C consent checkbox per the
  // 2026-07-20 design: Syarat & Ketentuan already enumerates them, and
  // collecting 5 individual checkbox clicks for what is legally one consent
  // (accepting the terms) added friction without adding consent quality.
  if (formData.get('attest_tc') !== 'on') return { error: ERROR_ATTESTATIONS_REQUIRED };

  // Parse counterpart phone
  const rawPhone = (formData.get('counterpart_phone') as string | null)?.trim() ?? '';
  const fieldErrors: Record<string, string> = {};

  let phoneE164 = '';
  try {
    phoneE164 = normalizePhone(rawPhone);
  } catch {
    fieldErrors.counterpart_phone = ERROR_PHONE_INVALID;
  }

  // C2, retired 2026-07-21: this used to collect a rekening from the
  // counterpart when the proposer's role was Pembeli (the proposer had none
  // to give at create time). createDeal now only accepts PENJUAL as a
  // proposer role, so every deal already has its rekening set from CREATE —
  // the counterpart never supplies one here. Passed through as null; the RPC
  // falls back to the deal's existing rekening (see virtualDealAfterJoin
  // below), unchanged from before this simplification.
  const rekeningTujuan: string | null = null;
  const rekeningBank: string | null = null;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  // Upsert counterpart party
  const pHash = phoneHash(phoneE164);
  await db
    .from('parties')
    .upsert({ phone_e164: phoneE164, phone_hash: pHash }, { onConflict: 'phone_hash', ignoreDuplicates: true });

  const { data: party, error: partyErr } = await db
    .from('parties')
    .select('id')
    .eq('phone_hash', pHash)
    .single();

  if (partyErr || !party) return { error: ERROR_PARTY_SAVE_FAILED };

  // Self-join guard — counterpart cannot be the same party as the proposer
  if (party.id === deal.proposer_id) return { error: ERROR_SELF_JOIN };

  // Validate both transitions (keeps state machine enforced even if the
  // status checks above diverge from VALID_TRANSITIONS in a future
  // refactor) — defense in depth, matching every other multi-step action in
  // this codebase.
  try {
    assertTransition(DealStatus.DRAF, DealEventName.COUNTERPART_JOINED);
    assertTransition(DealStatus.DIAJUKAN, DealEventName.ACCEPTED);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  // Two chained hashes, computed here (client-side relative to the RPC,
  // same as everywhere else in this app) before the atomic call: the join
  // event's hash, then the accept event's hash chained onto it. The RPC
  // re-verifies the first prior_hash under a row lock (migration 0025) —
  // same stale-hash race protection migration 0011 added for the old
  // two-step accept flow, needed here for the same reason.
  const { data: lastEvent } = await db
    .from('deal_events')
    .select('new_hash')
    .eq('deal_id', deal.id)
    .order('id', { ascending: false })
    .limit(1)
    .single();
  const joinPriorHash = lastEvent?.new_hash ?? null;

  const virtualDealAfterJoin = {
    ...deal,
    counterpart_id: party.id,
    status: DealStatus.DIAJUKAN,
    rekening_tujuan: rekeningTujuan ?? deal.rekening_tujuan,
    rekening_bank: rekeningBank ?? deal.rekening_bank,
  };
  const joinCanonical = buildCanonicalPayload(
    virtualDealAfterJoin,
    {
      name: DealEventName.COUNTERPART_JOINED,
      actor: 'COUNTERPART',
      payload: { tnc_version: SYARAT_KETENTUAN_VERSION, tnc_hash: SYARAT_KETENTUAN_HASH },
    },
    joinPriorHash,
  );
  const joinNewHash = hashDeal(joinCanonical);

  const virtualDealAfterAccept = { ...virtualDealAfterJoin, status: DealStatus.DISEPAKATI };
  const acceptCanonical = buildCanonicalPayload(
    virtualDealAfterAccept,
    { name: DealEventName.ACCEPTED, actor: 'SYSTEM', payload: null },
    joinNewHash,
  );
  const acceptNewHash = hashDeal(acceptCanonical);

  // Atomic: UPDATE deals (DRAF -> DISEPAKATI directly) + INSERT both
  // deal_events rows in one PL/pgSQL transaction. Returns 0 rows if a
  // concurrent submission already moved the deal out of DRAF.
  const { data: updatedDealRow, error: rpcErr } = await db
    .rpc('join_deal_with_event', {
      p_deal_id: deal.id,
      p_counterpart_id: party.id,
      p_join_prior_hash: joinPriorHash,
      p_join_new_hash: joinNewHash,
      p_accept_prior_hash: joinNewHash,
      p_accept_new_hash: acceptNewHash,
      p_rekening_tujuan: rekeningTujuan,
      p_rekening_bank: rekeningBank,
    })
    .single();

  if (rpcErr) {
    return {
      error:
        rpcErr.code === 'PGRST116'
          ? ERROR_DEAL_CLOSED
          : ERROR_JOIN_FAILED,
    };
  }
  if (!updatedDealRow) return { error: ERROR_DEAL_CLOSED };

  void submitAnchor(joinNewHash);
  void submitAnchor(acceptNewHash);

  // Remember this identification so the counterpart isn't asked to re-type
  // their phone on the very next screen — mirrors what setPartySession did
  // for both parties at the old accept step, now split across create
  // (proposer, see app/buat/actions.ts) and join (here) instead, since
  // acceptance itself no longer exists as a separate round trip.
  await setPartySession(token, 'counterpart');

  // The deal is DISEPAKATI the instant this completes — notify the payer
  // directly (no more intermediate "come accept" ping, since there's
  // nothing left to accept).
  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  const payerPartyId = payerSlot === 'proposer' ? deal.proposer_id : party.id;
  void notifyTurn(
    db,
    payerPartyId,
    'DISEPAKATI',
    formatDisepakatiMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
  );

  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}
