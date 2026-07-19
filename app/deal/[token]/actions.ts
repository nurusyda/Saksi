'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { SYARAT_KETENTUAN_VERSION, SYARAT_KETENTUAN_HASH } from '@/lib/legal';
import {
  ATTESTATIONS,
  ERROR_ATTESTATIONS_REQUIRED,
  ERROR_SELF_JOIN,
  ERROR_PHONE_INVALID,
  ERROR_PARTY_SAVE_FAILED,
  ERROR_JOIN_FAILED,
  ERROR_PHONE_NOT_IN_DEAL,
  STATUS_ALREADY_ACCEPTED,
  ERROR_DEAL_NOT_FOUND,
  ERROR_DEAL_CLOSED,
  ERROR_TOO_MANY_ATTEMPTS,
  ERROR_ACCEPT_FAILED,
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

  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DRAF)
    return { error: ERROR_DEAL_CLOSED };

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
    return { error: ERROR_DEAL_CLOSED };
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
    {
      name: DealEventName.COUNTERPART_JOINED,
      actor: 'COUNTERPART',
      payload: { tnc_version: SYARAT_KETENTUAN_VERSION, tnc_hash: SYARAT_KETENTUAN_HASH },
    },
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
          ? ERROR_DEAL_CLOSED
          : ERROR_JOIN_FAILED,
    };
  }
  if (!updatedDealRow) return { error: ERROR_DEAL_CLOSED };

  void submitAnchor(newHash);

  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}

export type AcceptDealState = {
  error?: string;
  info?: string;
};

export async function acceptDeal(
  token: string,
  _prev: AcceptDealState,
  formData: FormData,
): Promise<AcceptDealState> {
  const db = supabaseServer();

  // Load and verify deal is still in DIAJUKAN
  const { data: deal, error: dealErr } = await db
    .from('deals')
    .select('*')
    .eq('token', token)
    .single();

  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIAJUKAN)
    return { error: ERROR_DEAL_CLOSED };

  // Rate limit phone-guess attempts on this deal (not deal existence/status
  // checks above — this counts attempts to match a phone number, the actual
  // enumeration surface if the token leaks). Counts every submission
  // regardless of outcome, so malformed/wrong/valid guesses all count equally.
  const ATTEMPT_WINDOW_MINUTES = 15;
  const ATTEMPT_LIMIT = 10;
  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: attemptCount } = await db
    .from('accept_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('deal_id', deal.id)
    .gte('attempted_at', windowStart);
  if ((attemptCount ?? 0) >= ATTEMPT_LIMIT) return { error: ERROR_TOO_MANY_ATTEMPTS };
  const { error: attemptInsertErr } = await db
    .from('accept_attempts')
    .insert({ deal_id: deal.id });
  if (attemptInsertErr) console.error('accept_attempts insert failed', attemptInsertErr);

  // Phone re-entry here is identity confirmation, not registration — both
  // parties' numbers are already on file from creation/join. There's no
  // login/session, so this is the only way to know which party is acting.
  const rawPhone = (formData.get('phone') as string | null)?.trim() ?? '';
  let phoneE164 = '';
  try {
    phoneE164 = normalizePhone(rawPhone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  const pHash = phoneHash(phoneE164);

  const [{ data: proposerParty }, { data: counterpartParty }] = await Promise.all([
    db.from('parties').select('phone_hash').eq('id', deal.proposer_id).single(),
    deal.counterpart_id
      ? db.from('parties').select('phone_hash').eq('id', deal.counterpart_id).single()
      : Promise.resolve({ data: null }),
  ]);

  let whichParty: 'proposer' | 'counterpart' | null = null;
  if (proposerParty?.phone_hash === pHash) whichParty = 'proposer';
  else if (counterpartParty?.phone_hash === pHash) whichParty = 'counterpart';

  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const alreadyAccepted =
    whichParty === 'proposer' ? deal.proposer_accepted : deal.counterpart_accepted;
  if (alreadyAccepted) return { info: STATUS_ALREADY_ACCEPTED };

  const flagColumn = whichParty === 'proposer' ? 'proposer_accepted' : 'counterpart_accepted';
  const eventName =
    whichParty === 'proposer' ? DealEventName.PROPOSER_ACCEPTED : DealEventName.COUNTERPART_ACCEPTED;
  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  const { data: lastEvent } = await db
    .from('deal_events')
    .select('new_hash')
    .eq('deal_id', deal.id)
    .order('id', { ascending: false })
    .limit(1)
    .single();
  const priorHash = lastEvent?.new_hash ?? null;

  // Status is unchanged by this event — deal is passed through as-is.
  const canonical = buildCanonicalPayload(
    deal,
    { name: eventName, actor, payload: null },
    priorHash,
  );
  const newHash = hashDeal(canonical);

  const { data: updatedRow, error: rpcErr } = await db
    .rpc('record_party_acceptance', {
      p_deal_id: deal.id,
      p_flag_column: flagColumn,
      p_event: eventName,
      p_actor: actor,
      p_prior_hash: priorHash,
      p_new_hash: newHash,
    })
    .single();

  if (rpcErr) return { error: ERROR_ACCEPT_FAILED };
  if (!updatedRow) {
    // RPC ran fine but affected 0 rows — this party's flag was already true,
    // or the deal moved on (record_party_acceptance's own guard). A real no-op,
    // not an error.
    return { info: STATUS_ALREADY_ACCEPTED };
  }

  // record_party_acceptance's return type isn't generated/typed by Supabase
  // here, so the two flag columns need an explicit shape to read safely.
  const updatedFlags = updatedRow as {
    proposer_accepted: boolean;
    counterpart_accepted: boolean;
  };

  void submitAnchor(newHash);

  // Always attempt to finalize right after — record_party_acceptance's own
  // guard (WHERE status = 'DIAJUKAN' AND proposer_accepted AND
  // counterpart_accepted) makes this a safe no-op when the other party
  // hasn't accepted yet.
  if (updatedFlags.proposer_accepted && updatedFlags.counterpart_accepted) {
    const { data: lastEvent2 } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash2 = lastEvent2?.new_hash ?? null;

    // Defense in depth — matches the pattern everywhere else in this file.
    assertTransition(DealStatus.DIAJUKAN, DealEventName.ACCEPTED);

    // Built from the original, fully-typed `deal` fetch (not the untyped RPC
    // row) — only status and the two flags actually changed.
    const virtualDeal = {
      ...deal,
      proposer_accepted: true,
      counterpart_accepted: true,
      status: DealStatus.DISEPAKATI,
    };
    const canonical2 = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.ACCEPTED, actor: 'SYSTEM', payload: null },
      priorHash2,
    );
    const newHash2 = hashDeal(canonical2);

    const { data: finalizedRow } = await db
      .rpc('finalize_deal_acceptance', {
        p_deal_id: deal.id,
        p_prior_hash: priorHash2,
        p_new_hash: newHash2,
      })
      .single();

    if (finalizedRow) void submitAnchor(newHash2);
  }

  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}
