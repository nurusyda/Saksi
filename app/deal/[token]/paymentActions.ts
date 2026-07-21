'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID, createHash } from 'crypto';
import { supabaseServer } from '@/lib/supabase/server';
import { buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import {
  assertTransition,
  DealStatus,
  DealEventName,
  PAYMENT_DISPUTE_MAX_ROUNDS,
} from '@/lib/db/transitions';
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
  ERROR_STATEMENT_TOO_SHORT,
  ERROR_STATEMENT_TOO_LONG,
  ERROR_STATEMENT_SAVE_FAILED,
  ERROR_DISPUTE_ROUNDS_EXHAUSTED,
  formatBuktiUploadedMessage,
  formatReceiptConfirmedMessage,
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
  //
  // §40 — counts only; the row is written by identifyPartyByPhone when a
  // guess actually MISSES. This used to insert unconditionally, so every
  // legitimate read spent budget and a party could exhaust their own limit
  // just by reloading (see that function for the full account). Callers are
  // unchanged: they still gate on this before doing any work.
  return (attemptCount ?? 0) < ATTEMPT_LIMIT;
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
// getDealLedgerPublic (§31) — the same ledger, for a buyer who has not
// joined yet.
//
// getDealLedger above gates on being the payer, which a first-time visitor
// cannot satisfy: under the payment-anchored flow they are not a party until
// they submit their bukti. Gating the account's record behind having already
// committed would defeat the forced check, which only means anything before
// the buyer decides to trust the seller.
//
// This is not a new disclosure class. app/buat/actions.ts's
// getRekeningLedgerAction already reads the same ledger for an arbitrary
// typed bank+rekening with no identity at all, and /cek exposes the same
// per-account record publicly by design. This variant is strictly narrower:
// it resolves the account from a deal token the caller must already hold,
// rather than accepting any account the caller names.
//
// Still rate-limited — a capability token must not become an unbounded read.
// Reuses the per-deal identify limiter rather than adding a fourth limiter
// table; it counts attempts per deal, which is exactly the bound wanted here.
// Also gated behind LEDGER_DETAIL_ENABLED via isLedgerDetailEnabled(), same
// as every other ledger surface, so it renders nothing until GATE 1 clears.
// ============================================================

export async function getDealLedgerPublic(token: string): Promise<LedgerResult> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal || !deal.rekening_bank || !deal.rekening_tujuan) return { status: 'empty' };

  if (!isLedgerDetailEnabled()) return { status: 'empty' };
  if (!(await checkIdentifyRateLimit(db, deal.id))) return { status: 'error' };

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
  if (formData.get('attest_bukti') !== 'on') return { error: ERROR_BUKTI_ATTESTATION_REQUIRED };
  const file = formData.get('bukti_file') as File | null;
  if (!file || file.size === 0) return { error: ERROR_BUKTI_FILE_REQUIRED };

  const result = await recordBuktiForPayer(token, phone, file);
  if (result.error) return result;

  revalidatePath(`/deal/${token}`);
  redirect(`/deal/${token}`);
}

// ============================================================
// recordBuktiForPayer (§38) — the payment claim itself, taking the File
// directly instead of re-reading it from FormData.
//
// joinAndPay used to call submitBukti, which re-read `bukti_file` from the
// same FormData *after* the join's DB round-trips. Two production attempts to
// fix that in place (§36 re-buffering, §37 collapsing the screens) both left
// the join landing without the bukti — verified in the data, not the logs:
// deals sitting at DISEPAKATI with `CREATED -> COUNTERPART_JOINED -> ACCEPTED`
// and zero bukti rows, while the standalone upload path always worked.
//
// Rather than keep guessing at which part of that re-read was unsafe, the
// re-read is gone: the caller passes the File it already holds. joinAndPay
// buffers once, up front, and hands the same object here. Nothing about this
// function depends on request plumbing surviving an await.
//
// Every early return is logged with a distinct reason. The previous two
// attempts were hard to diagnose precisely because this failed silently while
// every layer reported success.
// ============================================================

export async function recordBuktiForPayer(
  token: string,
  phone: string,
  file: File,
): Promise<SubmitBuktiState> {
  const db = supabaseServer();
  const fail = (code: string, message: string): SubmitBuktiState => {
    console.error(`[bukti] ${code} for ${token}`);
    return { error: message };
  };

  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return fail('deal-not-found', ERROR_DEAL_NOT_FOUND);
  if (deal.status !== DealStatus.DISEPAKATI) {
    return fail(`wrong-status:${deal.status}`, ERROR_DEAL_CLOSED);
  }

  // Blocker found by monster_check: every action that re-verifies a
  // caller-supplied phone against a deal is a phone-enumeration oracle
  // (distinct error responses leak match/no-match/wrong-party) unless
  // rate-limited — this mutating action had the same identifyPartyByPhone
  // call as the view actions but was missing the guard.
  if (!(await checkIdentifyRateLimit(db, deal.id))) {
    return fail('rate-limited', ERROR_TOO_MANY_ATTEMPTS);
  }

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return fail('phone-invalid', ERROR_PHONE_INVALID);
  }
  if (!whichParty) return fail('phone-not-in-deal', ERROR_PHONE_NOT_IN_DEAL);

  // Jual-beli only (Section B gating) — the payer is whichever slot holds
  // Pembeli.
  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== payerSlot) {
    return fail(`wrong-party:${whichParty}`, ERROR_WRONG_PARTY_PEMBELI_ONLY);
  }

  try {
    assertTransition(DealStatus.DISEPAKATI, DealEventName.BUKTI_UPLOADED);
  } catch {
    return fail('invalid-transition', ERROR_DEAL_CLOSED);
  }

  const uploaded = await uploadBuktiImage(db, deal.id, file);
  if (!uploaded) return fail('upload-failed', ERROR_BUKTI_UPLOAD_FAILED);

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

    if (rpcErr) return fail(`rpc-error:${rpcErr.code}`, ERROR_BUKTI_SAVE_FAILED);
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

      // No redirect here — this is a plain function, not the action. Callers
      // decide what to do next, which is what lets joinAndPay keep running.
      return {};
    }
    if (attempt === RETRY_LIMIT - 1) return fail('stale-hash-exhausted', ERROR_BUKTI_SAVE_FAILED);
    // 0 rows, no error: stale prior_hash race — loop retries with a fresh snapshot.
  }

  return fail('retry-exhausted', ERROR_BUKTI_SAVE_FAILED);
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
// recordDanaBelumMasuk — C4's "Dana belum masuk / bukti salah".
//
// Rewritten 2026-07-21 (migration 0029). The previous version wrote nothing
// at all: no deal_events row, no persisted text, just a best-effort WA nudge
// whose delivery result the UI then reported. Two things were wrong with
// that. When the WA channel was down the buyer learned nothing, so the
// disagreement existed only in the seller's head. And the seller was shown
// a notification-delivery failure — a fact about an integration, not about
// their deal, and nothing they could act on.
//
// Now the seller says what actually happened and that statement is recorded,
// hash-chained, and shown to the buyer on their own status page. The record
// carries the disagreement rather than a messaging channel carrying it.
//
// Still NOT a breach report: self-transition on DIBAYAR_DIKLAIM, no flags
// row, no status change, no publication. It is one party's attributed
// account sitting next to the other party's bukti claim. The breach pipeline
// is unchanged and still gated on the deadline actually lapsing.
// ============================================================

// ============================================================
// The payment-dispute round limit (§30).
//
// The penjual says the money did not arrive; the pembeli answers with a
// corrected bukti; the penjual confirms or says it again. Two rounds, then
// both actions close.
//
// Two is deliberate. The overwhelmingly common cause of this dispute is a
// mistake, not fraud — the wrong screenshot attached, a transfer to an old
// account, a payment still in flight — and one round is enough to clear
// almost all of those. Past two, further rounds stop being clarification and
// become the two parties repeating themselves, which the record does not
// need more of. When the limit is reached the deal simply sits with both
// accounts on it until the deadline lapses, at which point the existing
// breach path (report -> 14-day hak jawab -> klaim berbeda) takes over. That
// path already exists, is already the agreed way a genuine disagreement gets
// settled, and reusing it is why this loop needs no new terminal state.
// ============================================================
// (PAYMENT_DISPUTE_MAX_ROUNDS lives in lib/db/transitions.ts — a 'use server'
// module may only export async functions, so a plain constant cannot be
// exported from here. It belongs next to the state machine anyway: it is the
// policy for how many times the DANA_BELUM_MASUK self-transition may fire.)

/** How many times the payee has already disputed this deal's payment. */
async function countPaymentDisputes(
  db: ReturnType<typeof supabaseServer>,
  dealId: string,
): Promise<number> {
  const { count } = await db
    .from('deal_events')
    .select('*', { count: 'exact', head: true })
    .eq('deal_id', dealId)
    .eq('event', DealEventName.DANA_BELUM_MASUK);
  return count ?? 0;
}

export type DanaBelumMasukState = { recorded?: boolean; error?: string; fieldError?: string };

export async function recordDanaBelumMasuk(
  token: string,
  phone: string,
  _prev: DanaBelumMasukState,
  formData: FormData,
): Promise<DanaBelumMasukState> {
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

  // Round limit, checked server-side — the client hides the button once the
  // limit is reached, but that is presentation, not enforcement.
  if ((await countPaymentDisputes(db, deal.id)) >= PAYMENT_DISPUTE_MAX_ROUNDS) {
    return { error: ERROR_DISPUTE_ROUNDS_EXHAUSTED };
  }

  const body = (formData.get('body') as string | null)?.trim() ?? '';
  if (body.length < 10) return { fieldError: ERROR_STATEMENT_TOO_SHORT };
  if (body.length > 600) return { fieldError: ERROR_STATEMENT_TOO_LONG };

  try {
    assertTransition(DealStatus.DIBAYAR_DIKLAIM, DealEventName.DANA_BELUM_MASUK);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';
  const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

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

    // Self-transition: the canonical payload hashes the deal as it stands,
    // status unchanged — same shape sweep_nudge_with_event's caller uses.
    const canonical = buildCanonicalPayload(
      cur,
      { name: DealEventName.DANA_BELUM_MASUK, actor, payload: { body_hash: bodyHash } },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('record_dana_belum_masuk_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_body: body,
        p_body_hash: bodyHash,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_STATEMENT_SAVE_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      return { recorded: true };
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_STATEMENT_SAVE_FAILED };
  }

  return { error: ERROR_STATEMENT_SAVE_FAILED };
}

// ============================================================
// submitBuktiFromForm (§37) — same payment claim, phone read from the form
// instead of bound by the caller.
//
// The buyer's page is now a single shape (rekening + record + copy + phone +
// bukti) whether the deal is DRAF or DISEPAKATI. At DRAF it joins and pays in
// one submit (joinAndPay); at DISEPAKATI the party already exists, so only the
// bukti is left — but the form still carries the phone, because there is no
// session and submitBukti has to re-derive which party is submitting.
//
// That is what lets IdentifyPartyGate disappear from the payer's path: the
// phone field IS the identification, collected in the same form as the thing
// it authorizes, rather than as a separate screen in front of it.
// ============================================================

export async function submitBuktiFromForm(
  token: string,
  _prev: SubmitBuktiState,
  formData: FormData,
): Promise<SubmitBuktiState> {
  const phone = (formData.get('counterpart_phone') as string | null)?.trim() ?? '';
  if (!phone) return { error: ERROR_PHONE_INVALID };
  return submitBukti(token, phone, {}, formData);
}

// ============================================================
// resubmitBukti (§30, migration 0031) — the pembeli's answer to a payment
// dispute. Mirrors submitBukti exactly (same attestation gate, same OCR
// consistency check, same retry-with-prior-hash loop); the differences are
// the eligible status (DIBAYAR_DIKLAIM, not DISEPAKATI), the RPC it calls,
// and that it is only offered while a dispute is open and rounds remain.
//
// The earlier bukti is kept, never overwritten — a reader has to be able to
// see that a first bukti was disputed and what replaced it.
// ============================================================

export async function resubmitBukti(
  token: string,
  phone: string,
  _prev: SubmitBuktiState,
  formData: FormData,
): Promise<SubmitBuktiState> {
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

  const payerSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== payerSlot) return { error: ERROR_WRONG_PARTY_PEMBELI_ONLY };

  // Only answerable if there is actually something to answer. Without this a
  // payer could re-upload unprompted, which is not what this path is for.
  const disputeCount = await countPaymentDisputes(db, deal.id);
  if (disputeCount === 0) return { error: ERROR_DEAL_CLOSED };
  if (disputeCount > PAYMENT_DISPUTE_MAX_ROUNDS) {
    return { error: ERROR_DISPUTE_ROUNDS_EXHAUSTED };
  }

  if (formData.get('attest_bukti') !== 'on') return { error: ERROR_BUKTI_ATTESTATION_REQUIRED };

  const file = formData.get('bukti_file') as File | null;
  if (!file || file.size === 0) return { error: ERROR_BUKTI_FILE_REQUIRED };

  try {
    assertTransition(DealStatus.DIBAYAR_DIKLAIM, DealEventName.BUKTI_UPLOADED);
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
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

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

    // Self-transition: status is already DIBAYAR_DIKLAIM and stays there, so
    // the canonical payload hashes the deal as it stands (no virtual status).
    const canonical = buildCanonicalPayload(
      cur,
      { name: DealEventName.BUKTI_UPLOADED, actor, payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('resubmit_bukti_with_event', {
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
      // §40 — redirect, not a bare return. This IS the outermost action (the
      // form binds it directly), so redirecting here is safe — unlike
      // joinDealCore, which had to stop doing it (§39). Returning {} left the
      // answer form on screen looking like nothing had happened, which is
      // exactly what a payer who had just answered a dispute reported.
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_BUKTI_SAVE_FAILED };
  }

  return { error: ERROR_BUKTI_SAVE_FAILED };
}

// ============================================================
// getPaymentDisputeState — what each side needs to render the loop: how many
// rounds have been used, and whether this deal is currently waiting on the
// payer to answer. Party-gated and rate-limited like every other read here.
// ============================================================

export type PaymentDisputeState = {
  disputeCount: number;
  roundsLeft: number;
  /** True when the newest event is a dispute, i.e. the payer owes an answer. */
  awaitingPayerAnswer: boolean;
};

export async function getPaymentDisputeState(
  token: string,
  phone: string,
): Promise<PaymentDisputeState | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal) return null;

  if (!(await checkIdentifyRateLimit(db, deal.id))) return null;

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return null;
  }
  if (!whichParty) return null;

  // Only DANA_BELUM_MASUK and BUKTI_UPLOADED matter for whose turn it is;
  // other events (nudges) must not flip the turn, so they are filtered out
  // rather than "take the last event of any kind".
  const { data: events } = await db
    .from('deal_events')
    .select('event')
    .eq('deal_id', deal.id)
    .in('event', [DealEventName.DANA_BELUM_MASUK, DealEventName.BUKTI_UPLOADED])
    .order('id', { ascending: true });

  const rows = events ?? [];
  const disputeCount = rows.filter((e) => e.event === DealEventName.DANA_BELUM_MASUK).length;
  const last = rows[rows.length - 1]?.event;

  return {
    disputeCount,
    roundsLeft: Math.max(0, PAYMENT_DISPUTE_MAX_ROUNDS - disputeCount),
    awaitingPayerAnswer: last === DealEventName.DANA_BELUM_MASUK,
  };
}

// ============================================================
// getDealStatements — both parties' recorded statements on this deal, shown
// to whichever party is viewing. Party-gated by phone like every other read
// here, and rate-limited through the same shared limiter (the phone argument
// makes it a guess-and-check oracle otherwise).
// ============================================================

export type DealStatement = { actor: 'PROPOSER' | 'COUNTERPART'; body: string; created_at: string };

export async function getDealStatements(token: string, phone: string): Promise<DealStatement[]> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal) return [];

  if (!(await checkIdentifyRateLimit(db, deal.id))) return [];

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return [];
  }
  if (!whichParty) return [];

  const { data } = await db
    .from('deal_statements')
    .select('actor, body, created_at')
    .eq('deal_id', deal.id)
    .order('id', { ascending: true });

  return data ?? [];
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
