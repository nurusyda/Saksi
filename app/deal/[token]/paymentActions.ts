'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { supabaseServer } from '@/lib/supabase/server';
import { buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { identifyPartyByPhone, type WhichParty } from '@/lib/db/party';
import { uploadBuktiImage } from '@/lib/db/storage';
import { checkBuktiConsistency } from '@/lib/ocr/gemini';
import { getAccountHistory, maskRekening } from '@/lib/db/accountHistory';
import {
  ERROR_DEAL_NOT_FOUND,
  ERROR_DEAL_CLOSED,
  ERROR_PHONE_INVALID,
  ERROR_PHONE_NOT_IN_DEAL,
  ERROR_TOO_MANY_ATTEMPTS,
  ERROR_BUKTI_ATTESTATION_REQUIRED,
  ERROR_BUKTI_FILE_REQUIRED,
  ERROR_BUKTI_UPLOAD_FAILED,
  ERROR_BUKTI_SAVE_FAILED,
  ERROR_CONFIRM_FAILED,
  ERROR_WRONG_PARTY_PEMBELI_ONLY,
  ERROR_WRONG_PARTY_PENJUAL_ONLY,
} from '@/lib/copy';

const RETRY_LIMIT = 3;

// Rate limit shared by every action that accepts a caller-supplied phone
// guess against a deal (identifyParty, getRekeningForPayer,
// getBuktiForDisplay — see migration 0017). Blocker found by monster_check
// twice over: first identifyParty shipped without this, then the two view
// actions built to fix the props-leak (getRekeningForPayer,
// getBuktiForDisplay) shipped as their own unprotected phone-guess oracles.
// Centralizing it here so a fourth call site can't repeat the omission.
async function checkIdentifyRateLimit(
  db: ReturnType<typeof supabaseServer>,
  dealId: string,
): Promise<boolean> {
  const ATTEMPT_WINDOW_MINUTES = 15;
  const ATTEMPT_LIMIT = 10;
  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: attemptCount } = await db
    .from('identify_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .gte('attempted_at', windowStart);
  // Known check-then-act race (same accepted trade-off as createDeal's daily
  // rate limit and the original accept_attempts check): two concurrent
  // requests can both pass this count before either inserts, allowing a
  // brief burst over ATTEMPT_LIMIT. Blast radius is small at this threshold.
  if ((attemptCount ?? 0) >= ATTEMPT_LIMIT) return false;
  const { error: attemptInsertErr } = await db.from('identify_attempts').insert({ deal_id: dealId });
  if (attemptInsertErr) console.error('identify_attempts insert failed', attemptInsertErr);
  return true;
}

// ============================================================
// identifyParty — view-only phone gate shared by every post-DISEPAKATI
// screen (C3/C4/C5). Does not mutate anything. The mutating actions below
// each re-derive whichParty from the phone independently (never trust a
// client-supplied role) — this exists only to decide which read-only view
// to render.
// ============================================================

export type IdentifyState = { error?: string; whichParty?: WhichParty };

export async function identifyParty(
  token: string,
  _prev: IdentifyState,
  formData: FormData,
): Promise<IdentifyState> {
  const db = supabaseServer();
  const { data: deal, error: dealErr } = await db
    .from('deals')
    .select('id, proposer_id, counterpart_id')
    .eq('token', token)
    .single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };

  // Rate limit — same pattern and posture as acceptDeal's accept_attempts
  // (0010): the match/no-match response is otherwise a phone-enumeration
  // oracle for anyone holding this deal's token. See migration 0017.
  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  const rawPhone = (formData.get('phone') as string | null)?.trim() ?? '';
  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, rawPhone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  return { whichParty };
}

// ============================================================
// getDealAccountHistory — C3's forced-check card (this also completes
// TIER_A_PLAN.md Phase 3: same shared query function as the ungated create-
// form check, now genuinely gated — the copy-rekening button stays disabled
// until this resolves). Looks up the deal's own fixed rekening, not
// arbitrary typed input.
// ============================================================

export type AccountHistoryDisplay =
  | { status: 'found'; selesaiCount: number; tidakDipenuhiCount: number; sinceLabel: string; rekeningMasked: string }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'idle' };

export async function getDealAccountHistory(token: string): Promise<AccountHistoryDisplay> {
  const db = supabaseServer();
  const { data: deal } = await db
    .from('deals')
    .select('rekening_bank, rekening_tujuan')
    .eq('token', token)
    .single();
  if (!deal || !deal.rekening_bank || !deal.rekening_tujuan) return { status: 'idle' };

  const result = await getAccountHistory(deal.rekening_bank, deal.rekening_tujuan);
  if (result.status === 'error') return { status: 'error' };
  if (result.status === 'empty') return { status: 'empty' };
  return {
    status: 'found',
    selesaiCount: result.history.selesaiCount,
    tidakDipenuhiCount: result.history.tidakDipenuhiCount,
    sinceLabel: result.history.sinceLabel,
    rekeningMasked: maskRekening(deal.rekening_tujuan),
  };
}

// ============================================================
// getRekeningForPayer — C3. Blocker found by monster_check: the full
// rekening was previously passed as a prop from the server component
// straight into DisepakatiPanel (a client component). Next.js serializes
// client-component props into the initial RSC payload at the server
// boundary — the client's own IdentifyPartyGate conditional never came into
// play, so every visitor with the link got the full account number before
// any phone verification. Fixed: page.tsx no longer passes rekening at all;
// PaymentForm fetches it through this action only after identification
// succeeds, and this action re-verifies the phone itself rather than
// trusting the caller's claimed identity.
// ============================================================

export interface RekeningForPayer {
  rekeningBank: string;
  rekeningTujuan: string;
}

export async function getRekeningForPayer(token: string, phone: string): Promise<RekeningForPayer | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal || !deal.rekening_bank || !deal.rekening_tujuan) return null;

  // Blocker found by monster_check: this action accepts a caller-supplied
  // phone guess and reveals a match/no-match result, the same
  // enumeration oracle identifyParty has — but shipped without its rate
  // limit. Closing it here too, not just at identifyParty.
  if (!(await checkIdentifyRateLimit(db, deal.id))) return null;

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return null;
  }
  if (!whichParty) return null;

  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== payerSlot) return null;

  return { rekeningBank: deal.rekening_bank, rekeningTujuan: deal.rekening_tujuan };
}

// ============================================================
// submitBukti — C3. Payer (Pembeli) uploads transfer proof. Atomic:
// DISEPAKATI -> DIBAYAR_DIKLAIM + bukti row + BUKTI_UPLOADED event.
// ============================================================

export type SubmitBuktiState = { error?: string };

export async function submitBukti(
  token: string,
  phone: string,
  _prev: SubmitBuktiState,
  formData: FormData,
): Promise<SubmitBuktiState> {
  const db = supabaseServer();

  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DISEPAKATI) return { error: ERROR_DEAL_CLOSED };

  // Blocker found by monster_check: every action that re-verifies a
  // caller-supplied phone against a deal is a phone-enumeration oracle
  // (distinct error responses leak match/no-match/wrong-party) unless
  // rate-limited — this mutating action had the same identifyPartyByPhone
  // call as the view actions but was missing the guard.
  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  // Jual-beli only (Section B gating) — the payer is whichever slot holds
  // Pembeli.
  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== payerSlot) return { error: ERROR_WRONG_PARTY_PEMBELI_ONLY };

  if (formData.get('attest_bukti') !== 'on') return { error: ERROR_BUKTI_ATTESTATION_REQUIRED };

  const file = formData.get('bukti_file') as File | null;
  if (!file || file.size === 0) return { error: ERROR_BUKTI_FILE_REQUIRED };

  try {
    assertTransition(DealStatus.DISEPAKATI, DealEventName.BUKTI_UPLOADED);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const uploaded = await uploadBuktiImage(db, deal.id, file);
  if (!uploaded) return { error: ERROR_BUKTI_UPLOAD_FAILED };

  const { ocrResult, verdict } = await checkBuktiConsistency(uploaded.bytes, uploaded.mimeType, {
    amount_idr: Number(deal.amount_idr),
    rekening_tujuan: deal.rekening_tujuan,
    rekening_bank: deal.rekening_bank,
    deadline: deal.deadline,
  });

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    const { data: cur } = await db.from('deals').select('*').eq('id', deal.id).single();
    if (!cur || cur.status !== DealStatus.DISEPAKATI) return { error: ERROR_DEAL_CLOSED };

    const { data: lastEvent } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash = lastEvent?.new_hash ?? null;

    const virtualDeal = { ...cur, status: DealStatus.DIBAYAR_DIKLAIM };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.BUKTI_UPLOADED, actor, payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('submit_bukti_with_event', {
        p_bukti_id: randomUUID(),
        p_deal_id: deal.id,
        p_uploader: actor,
        p_storage_path: uploaded.storagePath,
        p_attested: true,
        p_ocr_result: ocrResult,
        p_ocr_verdict: verdict,
        p_actor: actor,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_BUKTI_SAVE_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_BUKTI_SAVE_FAILED };
    // 0 rows, no error: stale prior_hash race — loop retries with a fresh snapshot.
  }

  return { error: ERROR_BUKTI_SAVE_FAILED };
}

// ============================================================
// getBuktiForDisplay — C4. Penjual's DIBAYAR_DIKLAIM page needs to show the
// uploaded image + OCR verdict without exposing the raw storage bucket
// (private, service-role only) to the client — a short-lived signed URL is
// generated here instead.
// ============================================================

export interface BuktiDisplay {
  signedUrl: string | null;
  ocrResult: { amount_match: boolean | null; date_ok: boolean | null; rekening_match: boolean | null; bank_match: boolean | null } | null;
  ocrVerdict: 'KONSISTEN' | 'TIDAK_KONSISTEN' | 'TIDAK_TERBACA' | null;
}

export async function getBuktiForDisplay(token: string, phone: string): Promise<BuktiDisplay | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal) return null;

  // Blocker found by monster_check: this action originally took only a
  // token and returned a signed URL to the bukti image (PII — sender's
  // account details) to anyone who called it, with no identity check at
  // all. The client-side IdentifyPartyGate only gated which component
  // *rendered* the call — it never stopped the server action itself from
  // being invoked directly. Now re-verifies phone + rate-limits, same as
  // every other action here.
  if (!(await checkIdentifyRateLimit(db, deal.id))) return null;

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return null;
  }
  if (!whichParty) return null;

  const payeeSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
  if (whichParty !== payeeSlot) return null;

  const { data: bukti } = await db
    .from('bukti')
    .select('storage_path, ocr_result, ocr_verdict')
    .eq('deal_id', deal.id)
    .eq('kind', 'TRANSFER')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bukti) return null;

  const { data: signed } = await db.storage.from('bukti').createSignedUrl(bukti.storage_path, 300);

  return {
    signedUrl: signed?.signedUrl ?? null,
    ocrResult: bukti.ocr_result,
    ocrVerdict: bukti.ocr_verdict,
  };
}

// ============================================================
// confirmReceipt — C4. Payee (Penjual) confirms funds received. Atomic:
// DIBAYAR_DIKLAIM -> DIKONFIRMASI_TERIMA + RECEIPT_CONFIRMED event.
// ============================================================

export type ConfirmActionState = { error?: string };

export async function confirmReceipt(
  token: string,
  phone: string,
  _prev: ConfirmActionState,
  _formData: FormData,
): Promise<ConfirmActionState> {
  const db = supabaseServer();

  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIBAYAR_DIKLAIM) return { error: ERROR_DEAL_CLOSED };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const payeeSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
  if (whichParty !== payeeSlot) return { error: ERROR_WRONG_PARTY_PENJUAL_ONLY };

  try {
    assertTransition(DealStatus.DIBAYAR_DIKLAIM, DealEventName.RECEIPT_CONFIRMED);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    // Re-fetch each iteration (matches submitBukti's pattern) — a stale
    // outer `deal` snapshot means a concurrent confirmation elsewhere would
    // exhaust every retry against an already-invalid status instead of
    // surfacing ERROR_DEAL_CLOSED immediately.
    const { data: cur } = await db.from('deals').select('*').eq('id', deal.id).single();
    if (!cur || cur.status !== DealStatus.DIBAYAR_DIKLAIM) return { error: ERROR_DEAL_CLOSED };

    const { data: lastEvent } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash = lastEvent?.new_hash ?? null;

    const virtualDeal = { ...cur, status: DealStatus.DIKONFIRMASI_TERIMA };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.RECEIPT_CONFIRMED, actor, payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('confirm_receipt_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_CONFIRM_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_CONFIRM_FAILED };
  }

  return { error: ERROR_CONFIRM_FAILED };
}

// ============================================================
// getDealTimeline — C5/C7. This deal's own event history (not the
// cross-deal rekening history shown on C3's forced-check card). deal_events
// is publicly readable per RLS (0001) — no PII in that table — but every
// read in this codebase goes through the service-role client regardless, so
// this follows suit.
// ============================================================

export interface TimelineEntry {
  event: string;
  actor: string;
  created_at: string;
}

export async function getDealTimeline(token: string): Promise<TimelineEntry[]> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('id').eq('token', token).single();
  if (!deal) return [];

  const { data: events } = await db
    .from('deal_events')
    .select('event, actor, created_at')
    .eq('deal_id', deal.id)
    .order('id', { ascending: true });

  return events ?? [];
}

// ============================================================
// confirmFulfillment — C5. Recipient (Pembeli) confirms goods received.
// Atomic: DIKONFIRMASI_TERIMA -> SELESAI + FULFILLMENT_CONFIRMED event.
// ============================================================

export async function confirmFulfillment(
  token: string,
  phone: string,
  _prev: ConfirmActionState,
  _formData: FormData,
): Promise<ConfirmActionState> {
  const db = supabaseServer();

  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIKONFIRMASI_TERIMA) return { error: ERROR_DEAL_CLOSED };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== payerSlot) return { error: ERROR_WRONG_PARTY_PEMBELI_ONLY };

  try {
    assertTransition(DealStatus.DIKONFIRMASI_TERIMA, DealEventName.FULFILLMENT_CONFIRMED);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    // Re-fetch each iteration — same reasoning as confirmReceipt above.
    const { data: cur } = await db.from('deals').select('*').eq('id', deal.id).single();
    if (!cur || cur.status !== DealStatus.DIKONFIRMASI_TERIMA) return { error: ERROR_DEAL_CLOSED };

    const { data: lastEvent } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash = lastEvent?.new_hash ?? null;

    const virtualDeal = { ...cur, status: DealStatus.SELESAI };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.FULFILLMENT_CONFIRMED, actor, payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('confirm_fulfillment_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_CONFIRM_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_CONFIRM_FAILED };
  }

  return { error: ERROR_CONFIRM_FAILED };
}
