'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { supabaseServer } from '@/lib/supabase/server';
import { buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { identifyPartyByPhone, getPartyPhone, type WhichParty } from '@/lib/db/party';
import { setPartySession } from '@/lib/db/partySession';
import { uploadBuktiImage } from '@/lib/db/storage';
import { checkBuktiConsistency } from '@/lib/ocr/gemini';
import { getAccountHistory, maskRekening } from '@/lib/db/accountHistory';
import { checkPairCompletionLimit, getRekeningLedger, isLedgerDetailEnabled, type LedgerResult } from '@/lib/db/ledger';
import { sendWaMessage } from '@/lib/wa/send';
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
  ERROR_PAIR_COMPLETION_LIMIT,
  formatBuktiUploadedMessage,
  formatReceiptConfirmedMessage,
  formatPaymentNotReceivedMessage,
  ERROR_NOTIFY_SEND_FAILED,
} from '@/lib/copy';

// Best-effort turn-taking WA nudge (UX-audit fix pass, 2026-07-20,
// copy-id.md §9b) — same contract as actions.ts's notifyTurn: never blocks
// or fails the transition it's attached to. Returns whether the send
// actually succeeded — most call sites fire this with `void` and ignore the
// result (the transition itself doesn't depend on it), but notifyTurn
// itself must not swallow the result, since notifyPaymentNotReceived's
// caller needs it to avoid a false "sent" claim (see that function).
async function notifyTurn(
  db: ReturnType<typeof supabaseServer>,
  partyId: string | null,
  template: 'BUKTI_UPLOADED' | 'RECEIPT_CONFIRMED' | 'PAYMENT_NOT_RECEIVED',
  message: string,
): Promise<boolean> {
  const phone = await getPartyPhone(db, partyId);
  if (!phone) return false;
  const { sent } = await sendWaMessage({ toPhoneE164: phone, template, params: { message } });
  return sent;
}

const RETRY_LIMIT = 3;

// Rate limit shared by every action that accepts a caller-supplied phone
// guess against a deal (identifyParty, getRekeningForPayer,
// getBuktiForDisplay — see migration 0017). Blocker found by monster_check
// twice over: first identifyParty shipped without this, then the two view
// actions built to fix the props-leak (getRekeningForPayer,
// getBuktiForDisplay) shipped as their own unprotected phone-guess oracles.
// Centralizing it here so a fourth call site can't repeat the omission.
// Exported so breachActions.ts (build step 4) can reuse the exact same
// shared limiter rather than adding a fifth unprotected phone-guess oracle —
// this is the "fourth call site" this comment already anticipated.
export async function checkIdentifyRateLimit(
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

  // Rate limit — the match/no-match response is otherwise a phone-enumeration
  // oracle for anyone holding this deal's token. See migration 0017. (Accept
  // no longer exists as a separate step, per migration 0025 — its own
  // accept_attempts limiter, migration 0010, was dropped along with it.)
  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  const rawPhone = (formData.get('phone') as string | null)?.trim() ?? '';
  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, rawPhone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  // Remember this identification for a short window so the next status
  // screen this party lands on (same deal, same browser) can skip asking
  // for the phone again — see partySession.ts for why this doesn't weaken
  // the re-verify-on-every-mutation model.
  await setPartySession(token, whichParty);

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
  | {
      status: 'found';
      selesaiCount: number;
      tidakDipenuhiCount: number;
      sinceLabel: string;
      rekeningMasked: string;
      ledgerEnabled: boolean;
    }
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
    ledgerEnabled: isLedgerDetailEnabled(),
  };
}

// ============================================================
// getDealLedger — B6/ledger design pass. Resolves this deal's own
// bank+rekening server-side and delegates to getRekeningLedger, same
// PII-boundary reasoning as getRekeningForPayer below: the client (
// DisepakatiPanel) never holds the raw rekening, only a token, so the
// ledger fetch has to be by-token too rather than the client re-submitting
// a rekening it was never given.
//
// Blocker found by monster_check: the first version of this function took
// only a token and returned the full ledger with no identity check at all —
// unlike every other action in this file, which re-verifies the caller's
// phone before returning anything rekening-adjacent. A ledger is strictly
// more sensitive than the aggregate count (per-deal amounts/descriptions,
// tier-gated counterpart phone_hash fragments across potentially many other
// people's deals with this same rekening), so it gets at least the same
// payer-only gate getRekeningForPayer already enforces, not less.
// ============================================================

export async function getDealLedger(token: string, phone: string): Promise<LedgerResult> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal || !deal.rekening_bank || !deal.rekening_tujuan) return { status: 'empty' };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { status: 'error' };

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { status: 'error' };
  }
  if (!whichParty) return { status: 'error' };

  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== payerSlot) return { status: 'error' };

  return getRekeningLedger(deal.rekening_bank, deal.rekening_tujuan);
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

      // Notify the payee (Penjual slot) it's their turn to review the bukti
      // and confirm receipt.
      const payeeSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
      const payeePartyId = payeeSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
      void notifyTurn(
        db,
        payeePartyId,
        'BUKTI_UPLOADED',
        formatBuktiUploadedMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
      );

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
// notifyPaymentNotReceived — C4's "Dana belum masuk". Deliberately NOT the
// start of a claim: no deal_events row, no status change, no RPC beyond the
// shared identify rate-limit. The only effect is a best-effort WA nudge to
// the payer, addressed to a plausible bank-delay explanation. The real
// mechanism for "funds genuinely never arrived" stays the deadline-lapse +
// OTP-gated breach pipeline (data-model.md) — this tap doesn't shortcut into
// that pipeline early.
// ============================================================

export type NotifyNotReceivedState = { sent?: boolean; error?: string };

export async function notifyPaymentNotReceived(
  token: string,
  phone: string,
  _prev: NotifyNotReceivedState,
  _formData: FormData,
): Promise<NotifyNotReceivedState> {
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

  const payerSlot: WhichParty = payeeSlot === 'proposer' ? 'counterpart' : 'proposer';
  const payerPartyId = payerSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;

  // Bug found by monster_check: this previously fired notifyTurn with `void`
  // and unconditionally returned { sent: true } — so PAYMENT_NOT_RECEIVED_ACK
  // ("Notifikasi terkirim ke pembeli...") displayed even when the WA send
  // actually failed (Fonnte down, invalid number, etc.), a false claim. This
  // is the one call site where the UI makes an explicit delivery claim, so
  // unlike the other notifyTurn calls in this file, it must be awaited.
  const sent = await notifyTurn(
    db,
    payerPartyId,
    'PAYMENT_NOT_RECEIVED',
    formatPaymentNotReceivedMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
  );

  return sent ? { sent: true } : { error: ERROR_NOTIFY_SEND_FAILED };
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

      // Notify the payer (Pembeli slot) it's their turn to confirm the
      // goods/fulfillment.
      const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
      const payerPartyId = payerSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
      void notifyTurn(
        db,
        payerPartyId,
        'RECEIPT_CONFIRMED',
        formatReceiptConfirmedMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
      );

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

// ============================================================
// getDealStatus — UX-audit fix pass (2026-07-20). Bare status string only,
// no PII, same "service-role reads only" posture as every other read here.
// Polled from waiting/passive panels (WaitingStatusPoll.tsx) so a party
// doesn't have to keep manually reloading to see the other side's progress.
// Deliberately a plain polled server action rather than Supabase Realtime:
// Realtime's postgres_changes respects RLS and the anon/authenticated roles
// have had SELECT revoked on `deals` entirely since migration 0009 (closing
// a PII leak of unmasked rekening_tujuan) — granting it back just to receive
// a status field would reopen that gap. This has none of that surface: it
// returns one enum string, nothing else, straight from the service-role
// client, same as every other read in this file.
//
// Rate-limited (migration 0027, found by monster_check 2026-07-21): unlike
// identifyParty and friends, this takes no phone, so there's no guess-and-
// check oracle here — the limit exists purely so a caller-supplied token
// can't be used to flood an unbounded read. Own table/threshold, not
// checkIdentifyRateLimit's — see checkDealStatusPollRateLimit below for why.
// ============================================================

// WaitingStatusPoll.tsx polls every ~12s (5/min); up to two viewers on the
// same deal over a 15-minute window is ~150 legitimate calls. 200 leaves
// headroom for tab duplicates/reloads while still bounding a scripted flood
// to a small multiple of real usage, not an unbounded one.
async function checkDealStatusPollRateLimit(
  db: ReturnType<typeof supabaseServer>,
  dealId: string,
): Promise<boolean> {
  const ATTEMPT_WINDOW_MINUTES = 15;
  const ATTEMPT_LIMIT = 200;
  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: attemptCount } = await db
    .from('deal_status_poll_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .gte('attempted_at', windowStart);
  // Same accepted check-then-act race as checkIdentifyRateLimit — blast
  // radius is small at this threshold.
  if ((attemptCount ?? 0) >= ATTEMPT_LIMIT) return false;
  const { error: attemptInsertErr } = await db.from('deal_status_poll_attempts').insert({ deal_id: dealId });
  if (attemptInsertErr) console.error('deal_status_poll_attempts insert failed', attemptInsertErr);
  return true;
}

export async function getDealStatus(token: string): Promise<string | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('id, status').eq('token', token).single();
  if (!deal) return null;
  // Rate-limited: a poll that's over the threshold just returns null, same
  // as "deal not found" — WaitingStatusPoll already no-ops on a falsy
  // result, so this silently skips a cycle rather than surfacing an error
  // for what's a best-effort convenience feature, not a user-facing action.
  if (!(await checkDealStatusPollRateLimit(db, deal.id))) return null;
  return deal.status;
}

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

// getEventCreatedAt — the exit-state panels (DibatalkanBersamaPanel and
// friends) need one specific past event's date to fill copy-id.md §7's
// locked [tgl] interpolation (e.g. "Dibatalkan atas kesepakatan bersama
// ([tgl])."). A single-event lookup rather than reusing getDealTimeline's
// full list, mirroring the flag page's own inline single-event query
// (app/flag/[token]/page.tsx) — same shape, shared here since five panels
// need it rather than one. Earliest match (ascending order) — every event
// this is used for fires at most once per deal, but ascending is the safer
// default over descending if that ever stops being true.
export async function getEventCreatedAt(token: string, eventName: string): Promise<string | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('id').eq('token', token).single();
  if (!deal) return null;

  const { data: event } = await db
    .from('deal_events')
    .select('created_at')
    .eq('deal_id', deal.id)
    .eq('event', eventName)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  return event?.created_at ?? null;
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

  // Signal 5 (data-model.md's ledger design pass, confirmed 2026-07-20) —
  // pair-completion circuit breaker: reject this SELESAI transition if it
  // would be the 6th between this exact (proposer, counterpart) pair within
  // 30 days. Checked once here, not inside the retry loop below: this is a
  // pre-condition on the transition itself, same posture as the role/status
  // checks above it, not a race the retry loop needs to re-arbitrate.
  // counterpart_id is guaranteed non-null at DIKONFIRMASI_TERIMA (both
  // parties have long since joined/accepted to reach this status).
  //
  // Gated behind isLedgerDetailEnabled(), same flag as the rest of this
  // feature — found by monster_check's copy-lock finding, indirectly: this
  // check was live in production unconditionally, meaning a real party
  // could already hit ERROR_PAIR_COMPLETION_LIMIT (unreviewed copy) even
  // though the design doc's gating discussion was about the ledger's *read*
  // side only. Signal 5 is part of the same feature and the same rollout
  // decision, not a separately-always-on mechanism.
  if (isLedgerDetailEnabled() && !(await checkPairCompletionLimit(db, deal.proposer_id, deal.counterpart_id as string))) {
    return { error: ERROR_PAIR_COMPLETION_LIMIT };
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
