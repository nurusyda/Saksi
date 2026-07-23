'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { setPartySession } from '@/lib/db/partySession';
import { SYARAT_KETENTUAN_VERSION, SYARAT_KETENTUAN_HASH } from '@/lib/legal';
import { recordBuktiForPayer } from './paymentActions';
import {
  ERROR_ATTESTATIONS_REQUIRED,
  ERROR_SELF_JOIN,
  ERROR_PHONE_INVALID,
  ERROR_PARTY_SAVE_FAILED,
  ERROR_JOIN_FAILED,
  ERROR_BUKTI_ATTESTATION_REQUIRED,
  ERROR_BUKTI_FILE_REQUIRED,
  ERROR_BUKTI_UPLOAD_FAILED,
  ERROR_DEAL_NOT_FOUND,
  ERROR_DEAL_CLOSED,
} from '@/lib/copy';

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
// Everything joining a deal involves, minus the redirect: joinAndPay needs
// to keep running afterwards (to submit the bukti in the same request), and a
// redirect() throws, so it cannot live in here. Returns the normalized phone
// on success so the caller can chain the payment submit without re-parsing
// what this function already validated.
type JoinCoreResult = JoinDealState | { phoneE164: string };

async function joinDealCore(token: string, formData: FormData): Promise<JoinCoreResult> {
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

  // §39 — returns, does NOT redirect. redirect() throws NEXT_REDIRECT, and
  // when this function still ended with one, that exception unwound straight
  // out of joinAndPay: the bukti code after the call never executed, on any
  // request, ever. That is the whole "two pages" bug — the join committed,
  // the payment claim was never even attempted, and the buyer was bounced to
  // the DISEPAKATI screen to upload a second time.
  //
  // It survived three fix attempts (§36 re-buffering, §37 collapsing the
  // screens, §38 removing the FormData re-read) because all three worked on
  // code downstream of a throw. The logs said so plainly the whole time —
  // the join's two anchors and the DISEPAKATI nudge, then nothing — and I
  // read the silence as "the claim failed quietly" rather than "the claim
  // never ran".
  //
  // Any caller that wants a redirect must do it itself, AFTER its own work.
  return { phoneE164 };
}

// ============================================================
// joinAndPay (§31) — the buyer's whole first visit, in one submit.
//
// SAKSI-MASTER.md §5's Page 1a is a single page: invoice, then rekening +
// its record + copy, then bukti upload, and "[ Kirim bukti transfer ]" is
// what mints the deal event — the record is payment-anchored. The two-step
// join-then-pay flow this replaces was a divergence from that spec: it put a
// phone wall in front of the account number, so the buyer had to identify
// themselves before they could even see what they were being asked to pay
// into, and the forced check (Law 7) happened after the decision to trust
// rather than before it.
//
// Now the account number and its record render immediately (server-side, no
// gate), and the phone is collected in the same form as the bukti — one
// submit, at the moment the buyer has actually paid.
//
// Two chained RPCs rather than one new combined RPC, deliberately:
// join_deal_with_event and submit_bukti_with_event are each already atomic
// and already hash-chain correctly, and a third RPC duplicating both would
// be a second place for the chaining to drift. If the join lands and the
// bukti submit then fails (upload error, OCR timeout), the deal is left at
// DISEPAKATI, where §37's same single buyer page renders again (phone +
// bukti, minus the T&C already given) as the retry path — a degraded but
// coherent state, not a corrupt one, and no longer a visibly different
// screen.
// ============================================================

export async function joinAndPay(
  token: string,
  _prev: JoinDealState,
  formData: FormData,
): Promise<JoinDealState> {
  // Validate the bukti inputs BEFORE joining. Without this a missing file or
  // unchecked attestation would still record the join, leaving a party on the
  // deal who never paid and never meant to.
  if (formData.get('attest_bukti') !== 'on') return { error: ERROR_BUKTI_ATTESTATION_REQUIRED };
  const file = formData.get('bukti_file') as File | null;
  if (!file || file.size === 0) return { error: ERROR_BUKTI_FILE_REQUIRED };

  // Re-buffer the upload into a fresh in-memory File before doing any
  // database work, and hand THAT to submitBukti.
  //
  // Why (production bug, 2026-07-21): joinAndPay was landing the join and
  // then failing the payment claim, silently, on every real attempt — Vercel
  // logs showed the join's two anchors and the DISEPAKATI nudge, then a 303,
  // with no BUKTI_UPLOADED anchor in the same request. The buyer was dropped
  // on the DISEPAKATI screen, uploaded a second time, and only that second
  // bukti was ever recorded. The distinguishing factor against the standalone
  // upload path (which always worked) is that here roughly a second of awaited
  // DB round-trips happens between the request body arriving and the file
  // being read, and a request-scoped File is not guaranteed to survive that
  // intact. Reading it once, immediately, removes the dependency entirely.
  //
  // It also fixes the ordering: everything that can fail on the input now
  // fails before the first write, so a bad upload can no longer leave a
  // joined party on a deal they never paid for.
  let buffered: File;
  try {
    buffered = new File([await file.arrayBuffer()], file.name || 'bukti.jpg', {
      type: file.type || 'application/octet-stream',
    });
  } catch {
    return { error: ERROR_BUKTI_UPLOAD_FAILED };
  }
  if (buffered.size === 0) return { error: ERROR_BUKTI_FILE_REQUIRED };
  formData.set('bukti_file', buffered);

  const joined = await joinDealCore(token, formData);
  if (!('phoneE164' in joined)) return joined;

  // §38 — hand recordBuktiForPayer the File this function already buffered,
  // instead of letting it re-read `bukti_file` out of FormData after the
  // join's DB round-trips. That re-read is what two previous fixes failed to
  // make safe; removing it removes the dependency rather than working around
  // it. This core does not redirect, so control returns here either way.
  const bukti = await recordBuktiForPayer(token, joined.phoneE164, buffered);

  // Join landed, payment claim did not. The deal is no longer DRAF, so this
  // form's own page will not render again — the retry has to happen on the
  // DISEPAKATI screen, which shows the same rekening card and upload field
  // minus the phone. Log the reason: this used to redirect silently, which is
  // how the double-upload bug above stayed invisible in production.
  if (bukti.error) {
    // recordBuktiForPayer already logged the specific reason code.
    console.error(`[joinAndPay] joined but bukti not recorded for ${token}`);
  }
  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}

