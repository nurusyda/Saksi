'use server';

import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { buildCanonicalPayload, hashDeal, normalizePhone } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { identifyPartyByPhone, getPartyPhone, type WhichParty } from '@/lib/db/party';
import { submitAnchor } from '@/lib/db/anchor';
import { maskRekening } from '@/lib/db/accountHistory';
import { sendOtp, verifyOtp, consumeVerifiedOtp } from '@/lib/otp';
import { sendWaMessage } from '@/lib/wa/send';
import { checkIdentifyRateLimit } from './paymentActions';
import {
  ERROR_DEAL_NOT_FOUND,
  ERROR_DEAL_CLOSED,
  ERROR_PHONE_INVALID,
  ERROR_PHONE_NOT_IN_DEAL,
  ERROR_TOO_MANY_ATTEMPTS,
  ERROR_WRONG_PARTY_PEMBELI_ONLY,
  ERROR_WRONG_PARTY_PENJUAL_ONLY,
  ERROR_OTP_SEND_FAILED,
  ERROR_OTP_SEND_RATE_LIMITED,
  ERROR_OTP_INVALID,
  ERROR_OTP_TOO_MANY_ATTEMPTS,
  ERROR_REPORT_FILE_FAILED,
  ERROR_HAK_JAWAB_WINDOW_CLOSED,
  ERROR_HAK_JAWAB_FAILED,
  formatBarangTidakSesuaiFiledMessage,
  formatHakJawabFiledMessage,
} from '@/lib/copy';

const RETRY_LIMIT = 3;
const HAK_JAWAB_WINDOW_DAYS = 14;

// Only a hash of a free-text note goes into deal_events.payload (publicly
// readable, see migration 0020's header comment) — the raw text lives in
// breach_notes (service-role only). The hash still lets anyone with the
// actual disclosed text later verify it matches what was witnessed.
function hashNote(note: string): string {
  return createHash('sha256').update(note, 'utf8').digest('hex');
}

// Best-effort turn-taking WA nudge, same contract as actions.ts/
// paymentActions.ts's notifyTurn: never blocks or fails the transition.
async function notifyTurn(
  db: ReturnType<typeof supabaseServer>,
  partyId: string | null,
  template: 'BARANG_TIDAK_SESUAI_FILED' | 'HAK_JAWAB_FILED',
  message: string,
): Promise<void> {
  const phone = await getPartyPhone(db, partyId);
  if (!phone) return;
  void sendWaMessage({ toPhoneE164: phone, template, params: { message } });
}

// ============================================================
// sendBreachReportOtp / verifyBreachReportOtpAction — the OTP step inside
// BarangTidakSesuaiModal. Reporter is always the Pembeli slot (only the
// buyer can claim goods didn't match — this modal is only ever rendered
// from DikonfirmasiTerimaPanel's PembeliPanel). Both re-derive whichParty
// from the phone independently, same posture as every other action here —
// the modal's own state is never trusted.
// ============================================================

export type SendOtpState = { sent?: boolean; error?: string };

export async function sendBreachReportOtp(
  token: string,
  phone: string,
  _prev: SendOtpState,
  _formData: FormData,
): Promise<SendOtpState> {
  const db = supabaseServer();
  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIKONFIRMASI_TERIMA) return { error: ERROR_DEAL_CLOSED };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  let phoneE164: string;
  try {
    phoneE164 = normalizePhone(phone);
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const reporterSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== reporterSlot) return { error: ERROR_WRONG_PARTY_PEMBELI_ONLY };

  const { sent, rateLimited } = await sendOtp(db, deal.id, phoneE164);
  if (rateLimited) return { error: ERROR_OTP_SEND_RATE_LIMITED };
  if (!sent) return { error: ERROR_OTP_SEND_FAILED };
  return { sent: true };
}

export type VerifyOtpState = { verified?: boolean; error?: string };

export async function verifyBreachReportOtpAction(
  token: string,
  phone: string,
  _prev: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const db = supabaseServer();
  const code = (formData.get('otp_code') as string | null)?.trim() ?? '';
  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIKONFIRMASI_TERIMA) return { error: ERROR_DEAL_CLOSED };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  let phoneE164: string;
  try {
    phoneE164 = normalizePhone(phone);
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const reporterSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== reporterSlot) return { error: ERROR_WRONG_PARTY_PEMBELI_ONLY };

  const result = await verifyOtp(db, deal.id, phoneE164, code);
  if (!result.verified) {
    return { error: result.error === 'too_many_attempts' ? ERROR_OTP_TOO_MANY_ATTEMPTS : ERROR_OTP_INVALID };
  }
  return { verified: true };
}

// ============================================================
// fileBarangTidakSesuaiReport — C6's real submit. Requires an OTP verified
// in the last 15 minutes for this phone+deal (consumeVerifiedOtp), never a
// client-supplied "I verified" flag. Atomic: DIKONFIRMASI_TERIMA ->
// TIDAK_DIPENUHI + TENGGAT_LEWAT event + flags row (migration 0020).
// ============================================================

export type FileReportState = { error?: string; filed?: boolean };

async function getPartyIdentityFields(
  db: ReturnType<typeof supabaseServer>,
  partyId: string | null,
): Promise<{ phoneHash: string | null; ekycPassed: boolean }> {
  if (!partyId) return { phoneHash: null, ekycPassed: false };
  const { data } = await db.from('parties').select('phone_hash, ekyc_status').eq('id', partyId).single();
  return { phoneHash: data?.phone_hash ?? null, ekycPassed: data?.ekyc_status === 'PASSED' };
}

export async function fileBarangTidakSesuaiReport(
  token: string,
  phone: string,
  _prev: FileReportState,
  formData: FormData,
): Promise<FileReportState> {
  const db = supabaseServer();
  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIKONFIRMASI_TERIMA) return { error: ERROR_DEAL_CLOSED };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  let phoneE164: string;
  try {
    phoneE164 = normalizePhone(phone);
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const reporterSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  if (whichParty !== reporterSlot) return { error: ERROR_WRONG_PARTY_PEMBELI_ONLY };

  if (!(await consumeVerifiedOtp(db, deal.id, phoneE164))) {
    return { error: ERROR_OTP_INVALID };
  }

  const fieldNote = (formData.get('field_note') as string | null)?.trim() ?? '';

  try {
    assertTransition(DealStatus.DIKONFIRMASI_TERIMA, DealEventName.TENGGAT_LEWAT);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  // Rung 1, not 0: this report path is only reachable from
  // DIKONFIRMASI_TERIMA, which itself only exists once RECEIPT_CONFIRMED
  // has already fired — data-model.md's rung rule ("bukti confirmed by
  // counterpart earlier? rung 1 : rung 0") resolves to 1 unconditionally
  // here, never 0.
  const rung = 1;

  const flaggedSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
  const flaggedPartyId = flaggedSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
  const flagged = await getPartyIdentityFields(db, flaggedPartyId);

  const identifiers: Record<string, unknown> = {
    rekening_masked: maskRekening(deal.rekening_tujuan as string),
    bank: deal.rekening_bank,
  };
  if ((deal.tier === 'LIMA_RIBU' || deal.tier === 'BERMETERAI') && flagged.phoneHash) {
    identifiers.phone_hash = flagged.phoneHash;
  }
  if (deal.tier === 'BERMETERAI' && flagged.ekycPassed) {
    identifiers.identity_verified = true;
  }

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

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

    const fieldNoteHash = hashNote(fieldNote);
    const virtualDeal = { ...cur, status: DealStatus.TIDAK_DIPENUHI };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.TENGGAT_LEWAT, actor, payload: { field_note_hash: fieldNoteHash } },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('file_barang_tidak_sesuai_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_field_note: fieldNote,
        p_field_note_hash: fieldNoteHash,
        p_rung: rung,
        p_identifiers: identifiers,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_REPORT_FILE_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      void notifyTurn(
        db,
        flaggedPartyId,
        'BARANG_TIDAK_SESUAI_FILED',
        formatBarangTidakSesuaiFiledMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
      );
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_REPORT_FILE_FAILED };
  }

  return { error: ERROR_REPORT_FILE_FAILED };
}

// ============================================================
// respondHakJawab — the flagged party's (Penjual) response within the
// 14-day window. Bare-bones: dispute + optional text note only, no evidence
// upload yet — deliberately not exposing an "I attached evidence" checkbox
// with nothing actually stored behind it, since flags.identifiers/flag body
// text must stay true even when a party is lying (has_evidence is wired
// through to the RPC/event payload already, hardcoded false here, ready for
// a real upload step later). Atomic: TIDAK_DIPENUHI -> SENGKETA +
// HAK_JAWAB_FILED event + flags.hak_jawab_status = DISPUTED (migration 0020).
// ============================================================

// ============================================================
// getBreachReportNote / getHakJawabResponse — view-only, but IDENTITY-GATED
// (fixed 2026-07-20, monster_check BLOCKER): unlike getDealTimeline, these
// read free-text a person typed, now stored in breach_notes (service-role
// only, never publicly readable — see migration 0020). Whichever of the two
// parties is calling is fine (no specific-role restriction like the
// file/respond actions), but a caller must still prove they're a party to
// THIS deal — same rate-limited identify pattern as getBuktiForDisplay/
// getRekeningForPayer.
// ============================================================

export interface BreachReportNote {
  fieldNote: string;
  filedAt: string;
}

export async function getBreachReportNote(token: string, phone: string): Promise<BreachReportNote | null> {
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

  const { data: note } = await db
    .from('breach_notes')
    .select('field_note, created_at')
    .eq('deal_id', deal.id)
    .maybeSingle();
  if (!note) return null;

  return { fieldNote: note.field_note, filedAt: note.created_at };
}

export interface HakJawabResponse {
  responseNote: string;
  hasEvidence: boolean;
  respondedAt: string;
}

export async function getHakJawabResponse(token: string, phone: string): Promise<HakJawabResponse | null> {
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

  const { data: event } = await db
    .from('deal_events')
    .select('payload')
    .eq('deal_id', deal.id)
    .eq('event', DealEventName.HAK_JAWAB_FILED)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!event) return null;

  const { data: note } = await db
    .from('breach_notes')
    .select('response_note, responded_at')
    .eq('deal_id', deal.id)
    .maybeSingle();
  if (!note || !note.responded_at) return null;

  const payload = event.payload as { has_evidence?: boolean } | null;
  return {
    responseNote: note.response_note ?? '',
    hasEvidence: payload?.has_evidence ?? false,
    respondedAt: note.responded_at,
  };
}

export type RespondHakJawabState = { error?: string; responded?: boolean };

export async function respondHakJawab(
  token: string,
  phone: string,
  _prev: RespondHakJawabState,
  formData: FormData,
): Promise<RespondHakJawabState> {
  const db = supabaseServer();
  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.TIDAK_DIPENUHI) return { error: ERROR_DEAL_CLOSED };

  if (!(await checkIdentifyRateLimit(db, deal.id))) return { error: ERROR_TOO_MANY_ATTEMPTS };

  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, phone);
  } catch {
    return { error: ERROR_PHONE_INVALID };
  }
  if (!whichParty) return { error: ERROR_PHONE_NOT_IN_DEAL };

  const flaggedSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
  if (whichParty !== flaggedSlot) return { error: ERROR_WRONG_PARTY_PENJUAL_ONLY };

  // 14-day window, checked here rather than in the RPC: there is no sweep
  // yet to move the deal out of TIDAK_DIPENUHI once the window lapses (see
  // migration 0020's header comment), so the DB-level status guard alone
  // can't catch a late response.
  //
  // Bug found by monster_check: this used .single() and ignored its error,
  // so a transient query failure (not "no row exists" — deal.status already
  // guarantees a TENGGAT_LEWAT event exists) silently produced a null event,
  // which the fallback below then read as "window deadline 0" — reporting
  // the window closed to a party who may still be well within it. Now
  // treats a failed lookup as its own distinct, honest error instead of a
  // false window-closed claim.
  const { data: tenggatEvent, error: tenggatErr } = await db
    .from('deal_events')
    .select('created_at')
    .eq('deal_id', deal.id)
    .eq('event', DealEventName.TENGGAT_LEWAT)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (tenggatErr || !tenggatEvent) return { error: ERROR_HAK_JAWAB_FAILED };

  const windowDeadline =
    new Date(tenggatEvent.created_at).getTime() + HAK_JAWAB_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > windowDeadline) return { error: ERROR_HAK_JAWAB_WINDOW_CLOSED };

  const responseNote = (formData.get('response_note') as string | null)?.trim() ?? '';
  const hasEvidence = false; // see header comment — no upload mechanism yet

  try {
    assertTransition(DealStatus.TIDAK_DIPENUHI, DealEventName.HAK_JAWAB_FILED);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

    const { data: cur } = await db.from('deals').select('*').eq('id', deal.id).single();
    if (!cur || cur.status !== DealStatus.TIDAK_DIPENUHI) return { error: ERROR_DEAL_CLOSED };

    const { data: lastEvent } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash = lastEvent?.new_hash ?? null;

    const responseNoteHash = hashNote(responseNote);
    const virtualDeal = { ...cur, status: DealStatus.SENGKETA };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      {
        name: DealEventName.HAK_JAWAB_FILED,
        actor,
        payload: { has_evidence: hasEvidence, response_note_hash: responseNoteHash },
      },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('respond_hak_jawab_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_has_evidence: hasEvidence,
        p_response_note: responseNote,
        p_response_note_hash: responseNoteHash,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_HAK_JAWAB_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      const reporterSlot: WhichParty = deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
      const reporterPartyId = reporterSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
      void notifyTurn(
        db,
        reporterPartyId,
        'HAK_JAWAB_FILED',
        formatHakJawabFiledMessage(deal.item_desc, `https://saksi.app/deal/${token}`),
      );
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_HAK_JAWAB_FAILED };
  }

  return { error: ERROR_HAK_JAWAB_FAILED };
}
