'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { identifyPartyByPhone, getPartyPhone, type WhichParty } from '@/lib/db/party';
import { SYARAT_KETENTUAN_VERSION, SYARAT_KETENTUAN_HASH } from '@/lib/legal';
import { sendWaMessage } from '@/lib/wa/send';
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
  formatCounterpartJoinedMessage,
  formatPartyAcceptedMessage,
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
  template: 'COUNTERPART_JOINED' | 'PARTY_ACCEPTED' | 'DISEPAKATI',
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

  // C2 — when the proposer's role was Pembeli, the counterpart is Penjual
  // and must supply the destination account here (the proposer never had
  // one to give at create time). Not required in the other direction: a
  // Penjual-proposed deal already has its rekening set from CREATE.
  const counterpartSuppliesRekening = deal.proposer_role === 'PEMBELI';
  let rekeningTujuan: string | null = null;
  let rekeningBank: string | null = null;
  if (counterpartSuppliesRekening) {
    rekeningTujuan = (formData.get('rekening_tujuan') as string | null)?.trim() ?? '';
    rekeningBank = (formData.get('rekening_bank') as string | null)?.trim() ?? '';
    if (!rekeningTujuan) fieldErrors.rekening_tujuan = 'Nomor rekening wajib diisi.';
    if (!rekeningBank) fieldErrors.rekening_bank = 'Nama bank wajib diisi.';
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
  const virtualDeal = {
    ...deal,
    counterpart_id: party.id,
    status: DealStatus.DIAJUKAN,
    rekening_tujuan: rekeningTujuan ?? deal.rekening_tujuan,
    rekening_bank: rekeningBank ?? deal.rekening_bank,
  };
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

  void submitAnchor(newHash);

  // Notify the proposer it's their turn to accept — they created the deal
  // but have no way of knowing the counterpart just joined otherwise (no
  // session, no push; the URL is only as live as whoever last opened it).
  void notifyTurn(
    db,
    deal.proposer_id,
    'COUNTERPART_JOINED',
    formatCounterpartJoinedMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
  );

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
  let whichParty: WhichParty | null = null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, rawPhone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }

  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const flagColumn = whichParty === 'proposer' ? 'proposer_accepted' : 'counterpart_accepted';
  const eventName =
    whichParty === 'proposer' ? DealEventName.PROPOSER_ACCEPTED : DealEventName.COUNTERPART_ACCEPTED;
  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  // Bounded retry: fetch a fresh deal row at the top of each iteration so
  // the hash is always computed from current state. If the other party's
  // accept landed since our last attempt, the already-accepted guard fires
  // here (typed read) instead of depending on the RPC's 0-row return.
  const RETRY_LIMIT = 3;
  let recordedFlags: { proposer_accepted: boolean; counterpart_accepted: boolean } | null = null;
  let recordedNewHash: string | null = null;

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    // Not load-bearing (the RPC's row lock already serializes the only two
    // possible actors), but cheap insurance against pointless back-to-back
    // retries.
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

    const { data: cur, error: curErr } = await db
      .from('deals')
      .select('*')
      .eq('id', deal.id)
      .single();
    if (curErr || !cur || cur.status !== DealStatus.DIAJUKAN)
      return { error: ERROR_DEAL_CLOSED };
    const already =
      whichParty === 'proposer' ? cur.proposer_accepted : cur.counterpart_accepted;
    if (already) return { info: STATUS_ALREADY_ACCEPTED };

    const { data: lastEvent } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash = lastEvent?.new_hash ?? null;

    const canonical = buildCanonicalPayload(
      cur,
      { name: eventName, actor, payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('record_party_acceptance', {
        p_deal_id: deal.id,
        p_flag_column: flagColumn,
        p_event: eventName,
        p_actor: actor,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_ACCEPT_FAILED };

    if (rpcRow) {
      recordedFlags = rpcRow as { proposer_accepted: boolean; counterpart_accepted: boolean };
      recordedNewHash = newHash;
      break;
    }

    // 0 rows with prior_hash already verified by the RPC's row lock: the
    // other party's accept landed between our fresh `cur` fetch and the RPC
    // call, invalidating our prior_hash. Loop retries with a new snapshot.
  }

  if (!recordedFlags || !recordedNewHash) return { error: ERROR_ACCEPT_FAILED };

  void submitAnchor(recordedNewHash);

  const bothAccepted = recordedFlags.proposer_accepted && recordedFlags.counterpart_accepted;

  // Only one side has accepted so far — notify whichever party this request
  // was NOT from that it's their turn. (When both are true, both parties
  // have already accepted; the DISEPAKATI notification below covers that
  // case instead, targeted at the payer specifically.)
  if (!bothAccepted) {
    const otherPartyId = whichParty === 'proposer' ? deal.counterpart_id : deal.proposer_id;
    void notifyTurn(
      db,
      otherPartyId,
      'PARTY_ACCEPTED',
      formatPartyAcceptedMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
    );
  }

  // Always attempt to finalize right after — finalize_deal_acceptance's own
  // guard (WHERE status = 'DIAJUKAN' AND proposer_accepted AND
  // counterpart_accepted) makes this a safe no-op when the other party
  // hasn't accepted yet. Same stale-prior_hash race applies here too (two
  // individual-accept flows can each reach this step around the same time),
  // so it gets the same bounded retry.
  if (recordedFlags.proposer_accepted && recordedFlags.counterpart_accepted) {
    // Defense in depth — matches the pattern everywhere else in this file.
    try {
      assertTransition(DealStatus.DIAJUKAN, DealEventName.ACCEPTED);
    } catch {
      return { error: ERROR_ACCEPT_FAILED };
    }

    let finalized = false;

    for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

      const { data: lastEvent2 } = await db
        .from('deal_events')
        .select('new_hash')
        .eq('deal_id', deal.id)
        .order('id', { ascending: false })
        .limit(1)
        .single();
      const priorHash2 = lastEvent2?.new_hash ?? null;

      // Built from the original, fully-typed `deal` fetch — only status and
      // the two flags actually changed.
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

      const { data: finalizedRow, error: finalizeErr } = await db
        .rpc('finalize_deal_acceptance', {
          p_deal_id: deal.id,
          p_prior_hash: priorHash2,
          p_new_hash: newHash2,
        })
        .maybeSingle();

      if (finalizeErr) return { error: ERROR_ACCEPT_FAILED };

      if (finalizedRow) {
        void submitAnchor(newHash2);
        finalized = true;
        break;
      }

      // 0 rows: either a concurrent request already finalized it (check
      // status fresh — fine, nothing more to do) or our prior_hash was
      // stale (retry).
      const { data: freshDeal2 } = await db
        .from('deals')
        .select('status')
        .eq('id', deal.id)
        .single();
      if (freshDeal2?.status === DealStatus.DISEPAKATI) {
        finalized = true;
        break;
      }
    }

    // Bug flagged twice (once by me mid-session, then again by
    // monster_check): without this, exhausting every retry silently fell
    // through to the redirect below, leaving proposer_accepted and
    // counterpart_accepted both true but status stuck at DIAJUKAN — a
    // dead-end state with no way forward for either party.
    if (!finalized) {
      console.error('finalize_deal_acceptance exhausted retries', deal.id);
      return { error: ERROR_ACCEPT_FAILED };
    }

    // Both parties have now accepted — notify the payer it's their turn.
    // proposer_role never changes, so it's safe to read off the original
    // `deal` fetch rather than the loop's re-fetched `cur`.
    const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
    const payerPartyId = payerSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
    void notifyTurn(
      db,
      payerPartyId,
      'DISEPAKATI',
      formatDisepakatiMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
    );
  }

  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}
