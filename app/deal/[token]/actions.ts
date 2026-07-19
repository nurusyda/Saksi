'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import {
  ATTESTATIONS,
  ERROR_ATTESTATIONS_REQUIRED,
  ERROR_SELF_JOIN,
  ERROR_PHONE_INVALID,
  ERROR_PARTY_SAVE_FAILED,
  ERROR_JOIN_FAILED,
} from '@/lib/copy';

export type JoinDealState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

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

  if (dealErr || !deal) return { error: 'Kesepakatan tidak ditemukan.' };
  if (deal.status !== DealStatus.DRAF)
    return { error: 'Kesepakatan ini sudah tidak dapat dimasuki.' };

  // Attestation gate — must pass before any DB write
  const allAttestationsOn =
    ATTESTATIONS.every((_, i) => formData.get(`attest_${i}`) === 'on') &&
    formData.get('attest_tc') === 'on';
  if (!allAttestationsOn) return { error: ERROR_ATTESTATIONS_REQUIRED };

  // Parse counterpart phone
  const rawPhone = (formData.get('counterpart_phone') as string | null)?.trim() ?? '';
  const fieldErrors: Record<string, string> = {};

  let phoneE164 = '';
  try {
    phoneE164 = normalizePhone(rawPhone);
  } catch {
    fieldErrors.counterpart_phone = ERROR_PHONE_INVALID;
  }

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

  // Validate the transition (keeps state machine enforced even if status check above
  // diverges from VALID_TRANSITIONS in a future refactor)
  try {
    assertTransition(DealStatus.DRAF, DealEventName.COUNTERPART_JOINED);
  } catch {
    return { error: 'Kesepakatan ini sudah tidak dapat dimasuki.' };
  }

  // Fetch prior hash. This round-trip is separate from the RPC, so a concurrent
  // event inserted between this fetch and the RPC could cause the new hash to chain
  // to a stale prior. Currently impossible: a DRAF deal can only have a CREATED
  // event, and the RPC's WHERE status='DRAF' means a losing concurrent join never
  // writes an event. Becomes a live race once PERPANJANGAN or any mid-deal event
  // type is added — fix at that point by adding p_expected_prior_hash to the RPC
  // and verifying inside the function (see [DEFERRED] in SESSION_LOG.md).
  const { data: lastEvent } = await db
    .from('deal_events')
    .select('new_hash')
    .eq('deal_id', deal.id)
    .order('id', { ascending: false })
    .limit(1)
    .single();

  const priorHash = lastEvent?.new_hash ?? null;

  // Reconstruct the post-update deal state locally to compute the hash before the RPC
  // runs. Safe only while deals has no triggers or computed columns that fire on UPDATE
  // — a future migration adding either must also update this reconstruction.
  const virtualDeal = { ...deal, counterpart_id: party.id, status: DealStatus.DIAJUKAN };
  const canonical = buildCanonicalPayload(
    virtualDeal,
    { name: DealEventName.COUNTERPART_JOINED, actor: 'COUNTERPART', payload: null },
    priorHash,
  );
  const newHash = hashDeal(canonical);

  // Atomic: UPDATE deals + INSERT deal_events in one PL/pgSQL transaction.
  // Returns 0 rows if a concurrent submission already moved the deal out of DRAF.
  const { data: updatedDealRow, error: rpcErr } = await db
    .rpc('join_deal_with_event', {
      p_deal_id: deal.id,
      p_counterpart_id: party.id,
      p_prior_hash: priorHash,
      p_new_hash: newHash,
    })
    .single();

  if (rpcErr) {
    return {
      error:
        rpcErr.code === 'PGRST116'
          ? 'Kesepakatan ini sudah tidak dapat dimasuki.'
          : ERROR_JOIN_FAILED,
    };
  }
  if (!updatedDealRow) return { error: 'Kesepakatan ini sudah tidak dapat dimasuki.' };

  void submitAnchor(newHash);

  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}
