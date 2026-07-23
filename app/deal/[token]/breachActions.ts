'use server';

import { createHash } from 'crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { assertTransition, DealStatus, DealEventName } from '@/lib/db/transitions';
import { assertPartyInDeal, type WhichParty } from '@/lib/db/party';
import { submitAnchor } from '@/lib/db/anchor';
import { maskRekening } from '@/lib/db/accountHistory';
import { getTodayWib } from '@/lib/format';
import { uploadHakJawabEvidence, uploadReportEvidence } from '@/lib/db/storage';
import {
  ERROR_DEAL_NOT_FOUND,
  ERROR_DEAL_CLOSED,
  ERROR_REPORT_FILE_FAILED,
  ERROR_DEADLINE_NOT_PASSED,
  ERROR_HAK_JAWAB_WINDOW_CLOSED,
  ERROR_HAK_JAWAB_FAILED,
  ERROR_BUKTI_UPLOAD_FAILED,
  ERROR_STATEMENT_IMAGE_ATTEST_REQUIRED,
  ERROR_FLAG_NOT_PUBLISHED,
  ERROR_FLAG_RETRACT_FAILED,
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

// ============================================================
// §25 (2026-07-21): OTP removed. Identity is established via assertPartyInDeal
// (lib/db/party.ts) — rate-limited, server-side, never trusted from the client.
// WA notifications removed 2026-07-24 pending Meta Cloud API integration.
// ============================================================

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

  // The formal report fires TENGGAT_LEWAT ("deadline passed"), so filing it
  // before the deadline is incoherent — and the §42 clarification loop is what
  // the buyer uses before then. Enforced server-side, mirroring
  // fileDeadlineLapseReport: the UI gate (DikonfirmasiTerimaPanel) is only
  // presentation. Without this, a buyer could skip the two clarification rounds
  // and file immediately, landing straight in the hak-jawab -> klaim berbeda
  // path — exactly the bypass this closes.
  if (!deadlineHasPassed(deal.deadline)) return { error: ERROR_DEADLINE_NOT_PASSED };

  const auth = await assertPartyInDeal(db, deal, phone, { requiredRole: 'PEMBELI' });
  if (!auth.ok) return { error: auth.error };
  const { whichParty } = auth;

  const fieldNote = (formData.get('field_note') as string | null)?.trim() ?? '';

  // §45 — optional supporting image on the report. Uploaded once here, before
  // the retry loop; the storage path is persisted to report_evidence only in
  // the success branch (after the report itself is filed), so a filed report
  // never lacks the image its author attached. An attached image carries the
  // same genuineness attestation as bukti (T&C §6.1), enforced here.
  const evidenceFile = formData.get('evidence_file') as File | null;
  let reportEvidencePath: string | null = null;
  if (evidenceFile && evidenceFile.size > 0) {
    if (formData.get('attest_image') == null) {
      return { error: ERROR_STATEMENT_IMAGE_ATTEST_REQUIRED };
    }
    const uploaded = await uploadReportEvidence(db, deal.id, evidenceFile);
    if (!uploaded) return { error: ERROR_BUKTI_UPLOAD_FAILED };
    reportEvidencePath = uploaded.storagePath;
  }

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

  // migration 0036 — a QRIS deal has no rekening to mask; the flag's
  // identifiers carry the merchant name/NMID instead. Two identity types,
  // never both on the same flag, mirroring payment_method on deals itself.
  const identifiers: Record<string, unknown> =
    deal.payment_method === 'QRIS'
      ? { qris_merchant_name: deal.qris_merchant_name, qris_nmid: deal.qris_nmid }
      : { rekening_masked: maskRekening(deal.rekening_tujuan as string), bank: deal.rekening_bank };
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
      // Persist the reporter's evidence now that the report exists. A side
      // table like bukti/hak_jawab_evidence, not part of the hash chain, so a
      // best-effort insert after the atomic report write is the right split —
      // if it failed the report still stands, just without the image.
      if (reportEvidencePath) {
        await db.from('report_evidence').insert({
          deal_id: deal.id,
          storage_path: reportEvidencePath,
          mime_type: evidenceFile?.type || 'application/octet-stream',
        });
      }
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_REPORT_FILE_FAILED };
  }

  return { error: ERROR_REPORT_FILE_FAILED };
}

// ============================================================
// sendDeadlineLapseOtp / verifyDeadlineLapseOtpAction / fileDeadlineLapseReport
// — the second breach-report entry point (build step 4 follow-on): the
// "ghost seller" case. Pembeli already uploaded bukti (DIBAYAR_DIKLAIM), the
// deadline has passed, and Penjual never confirmed receipt at all. Mirrors
// sendBreachReportOtp/verifyBreachReportOtpAction/fileBarangTidakSesuaiReport
// above exactly in structure (same OTP gate, same reporter-is-Pembeli
// restriction, same atomic retry-with-hash-chain pattern) — kept as
// separate functions rather than parameterizing the existing three, mirroring
// migration 0021's choice to add a separate RPC rather than generalize
// 0020's. The one substantive difference: eligibility is DIBAYAR_DIKLAIM +
// deadline passed, not DIKONFIRMASI_TERIMA, and rung is unconditionally 0.
// ============================================================

// Strict `<`, not `<=`: the create form's minimum enforces deadline >=
// tomorrow (getTomorrowWib()), so the counterpart is entitled to the full
// calendar day of the deadline itself to act. Using `<=` would open
// eligibility at 00:00 WIB on the deadline date, cutting that day short by
// one day on both the client-side gate below and this server-side check.
function deadlineHasPassed(deadline: string): boolean {
  return deadline < getTodayWib();
}

export async function fileDeadlineLapseReport(
  token: string,
  phone: string,
  _prev: FileReportState,
  formData: FormData,
): Promise<FileReportState> {
  const db = supabaseServer();
  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };
  if (deal.status !== DealStatus.DIBAYAR_DIKLAIM) return { error: ERROR_DEAL_CLOSED };
  if (!deadlineHasPassed(deal.deadline)) return { error: ERROR_DEADLINE_NOT_PASSED };

  const auth = await assertPartyInDeal(db, deal, phone, { requiredRole: 'PEMBELI' });
  if (!auth.ok) return { error: auth.error };
  const { whichParty } = auth;

  // Optional here (unlike C6's field_note, which requires the reporter to
  // describe which part of the description wasn't met): the claim itself is
  // system-derivable — deadline passed, Penjual never confirmed receipt.
  const fieldNote = (formData.get('field_note') as string | null)?.trim() ?? '';

  try {
    assertTransition(DealStatus.DIBAYAR_DIKLAIM, DealEventName.TENGGAT_LEWAT);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  // No local rung constant here (unlike fileBarangTidakSesuaiReport's rung
  // = 1): file_deadline_lapse_with_event (migration 0021) hardcodes rung 0
  // inside the function rather than taking it as a parameter, since it's
  // unconditionally true whenever this RPC's WHERE status = 'DIBAYAR_DIKLAIM'
  // guard passes — RECEIPT_CONFIRMED has never fired for this deal.

  const flaggedSlot: WhichParty = deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
  const flaggedPartyId = flaggedSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
  const flagged = await getPartyIdentityFields(db, flaggedPartyId);

  // migration 0036 — see the mirror comment in fileBarangTidakSesuaiReport above.
  const identifiers: Record<string, unknown> =
    deal.payment_method === 'QRIS'
      ? { qris_merchant_name: deal.qris_merchant_name, qris_nmid: deal.qris_nmid }
      : { rekening_masked: maskRekening(deal.rekening_tujuan as string), bank: deal.rekening_bank };
  if ((deal.tier === 'LIMA_RIBU' || deal.tier === 'BERMETERAI') && flagged.phoneHash) {
    identifiers.phone_hash = flagged.phoneHash;
  }
  if (deal.tier === 'BERMETERAI' && flagged.ekycPassed) {
    identifiers.identity_verified = true;
  }

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

    const fieldNoteHash = hashNote(fieldNote);
    const virtualDeal = { ...cur, status: DealStatus.TIDAK_DIPENUHI };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.TENGGAT_LEWAT, actor, payload: { field_note_hash: fieldNoteHash } },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('file_deadline_lapse_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_field_note: fieldNote,
        p_field_note_hash: fieldNoteHash,
        p_identifiers: identifiers,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_REPORT_FILE_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
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
  // §45 — signed URL for the reporter's optional attached image (report_evidence,
  // migration 0034). Resolved server-side behind the same identity gate; null
  // when none was attached.
  evidenceSignedUrl: string | null;
}

export async function getBreachReportNote(token: string, phone: string): Promise<BreachReportNote | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal) return null;

  const auth = await assertPartyInDeal(db, deal, phone);
  if (!auth.ok) return null;

  const { data: note } = await db
    .from('breach_notes')
    .select('field_note, created_at')
    .eq('deal_id', deal.id)
    .maybeSingle();
  if (!note) return null;

  let evidenceSignedUrl: string | null = null;
  const { data: evidence } = await db
    .from('report_evidence')
    .select('storage_path')
    .eq('deal_id', deal.id)
    .maybeSingle();
  if (evidence) {
    const { data: signed } = await db.storage.from('bukti').createSignedUrl(evidence.storage_path, 300);
    evidenceSignedUrl = signed?.signedUrl ?? null;
  }

  return { fieldNote: note.field_note, filedAt: note.created_at, evidenceSignedUrl };
}

export interface HakJawabResponse {
  responseNote: string;
  hasEvidence: boolean;
  evidenceSignedUrl: string | null;
  respondedAt: string;
}

export async function getHakJawabResponse(token: string, phone: string): Promise<HakJawabResponse | null> {
  const db = supabaseServer();
  const { data: deal } = await db.from('deals').select('*').eq('token', token).single();
  if (!deal) return null;

  const auth = await assertPartyInDeal(db, deal, phone);
  if (!auth.ok) return null;

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
  const hasEvidence = payload?.has_evidence ?? false;

  // Short-lived signed URL, same 300s pattern as getBuktiForDisplay — the
  // private bucket path is never exposed directly, and both parties to the
  // dispute (not just one slot, unlike bukti's payee-only view) are allowed
  // to see it: identifyPartyByPhone above already proved this caller is one
  // of the two.
  let evidenceSignedUrl: string | null = null;
  if (hasEvidence) {
    const { data: evidence } = await db
      .from('hak_jawab_evidence')
      .select('storage_path')
      .eq('deal_id', deal.id)
      .maybeSingle();
    if (evidence) {
      const { data: signed } = await db.storage.from('bukti').createSignedUrl(evidence.storage_path, 300);
      evidenceSignedUrl = signed?.signedUrl ?? null;
    }
  }

  return {
    responseNote: note.response_note ?? '',
    hasEvidence,
    evidenceSignedUrl,
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

  const auth = await assertPartyInDeal(db, deal, phone, { requiredRole: 'PENJUAL' });
  if (!auth.ok) return { error: auth.error };
  const { whichParty } = auth;

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

  // Optional, unlike bukti transfer upload: offered only as a response to
  // being reported (never proactively), and its absence isn't itself a
  // claim about anything. hasEvidence only becomes true once the upload has
  // actually succeeded — a failed upload must not silently proceed as "no
  // evidence" when the responder explicitly attached a file, so that case
  // errors out below instead.
  const evidenceFile = formData.get('evidence_file') as File | null;
  let evidenceStoragePath: string | null = null;
  let evidenceMimeType: string | null = null;
  if (evidenceFile && evidenceFile.size > 0) {
    const uploaded = await uploadHakJawabEvidence(db, deal.id, evidenceFile);
    if (!uploaded) return { error: ERROR_BUKTI_UPLOAD_FAILED };
    evidenceStoragePath = uploaded.storagePath;
    evidenceMimeType = uploaded.mimeType;
  }
  const hasEvidence = evidenceStoragePath !== null;

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
        p_evidence_storage_path: evidenceStoragePath,
        p_evidence_mime_type: evidenceMimeType,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_HAK_JAWAB_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_HAK_JAWAB_FAILED };
  }

  return { error: ERROR_HAK_JAWAB_FAILED };
}

// ============================================================
// retractFlag — the original reporter (PEMBELI) can retract a published flag.
// The flag stays in the DB (history is preserved); retracted_at is set so the
// flag page renders the retraction status. Hash-chained like every other event.
// Only callable when flags.published_at is set AND retracted_at is null.
// ============================================================

export type RetractFlagState = { error?: string; retracted?: boolean };

export async function retractFlag(
  token: string,
  phone: string,
  _prev: RetractFlagState,
  formData: FormData,
): Promise<RetractFlagState> {
  const db = supabaseServer();
  const { data: deal, error: dealErr } = await db.from('deals').select('*').eq('token', token).single();
  if (dealErr || !deal) return { error: ERROR_DEAL_NOT_FOUND };

  // Must be in TIDAK_DIPENUHI or SENGKETA — the only states a published flag can be in.
  if (deal.status !== DealStatus.TIDAK_DIPENUHI && deal.status !== DealStatus.SENGKETA) {
    return { error: ERROR_DEAL_CLOSED };
  }

  // Only the reporter (PEMBELI) can retract their own report.
  const auth = await assertPartyInDeal(db, deal, phone, { requiredRole: 'PEMBELI' });
  if (!auth.ok) return { error: auth.error };

  // Verify the flag is published and not already retracted.
  const { data: flag } = await db
    .from('flags')
    .select('published_at, retracted_at')
    .eq('deal_id', deal.id)
    .single();
  if (!flag || !flag.published_at || flag.retracted_at) {
    return { error: ERROR_FLAG_NOT_PUBLISHED };
  }

  const retractionReason = (formData.get('retraction_reason') as string | null)?.trim() ?? '';

  try {
    assertTransition(deal.status as DealStatus, DealEventName.FLAG_RETRACTED);
  } catch {
    return { error: ERROR_DEAL_CLOSED };
  }

  const actor = auth.whichParty === 'proposer' ? 'PROPOSER' : 'COUNTERPART';

  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 50 * attempt));

    const { data: cur } = await db.from('deals').select('*').eq('id', deal.id).single();
    if (!cur) return { error: ERROR_DEAL_NOT_FOUND };

    const { data: lastEvent } = await db
      .from('deal_events')
      .select('new_hash')
      .eq('deal_id', deal.id)
      .order('id', { ascending: false })
      .limit(1)
      .single();
    const priorHash = lastEvent?.new_hash ?? null;

    const retractionReasonHash = retractionReason ? hashNote(retractionReason) : undefined;
    const canonical = buildCanonicalPayload(
      cur,
      { name: DealEventName.FLAG_RETRACTED, actor, payload: { retraction_reason_hash: retractionReasonHash } },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error: rpcErr } = await db
      .rpc('retract_flag_with_event', {
        p_deal_id: deal.id,
        p_actor: actor,
        p_retraction_reason: retractionReason,
        p_prior_hash: priorHash,
        p_new_hash: newHash,
      })
      .maybeSingle();

    if (rpcErr) return { error: ERROR_FLAG_RETRACT_FAILED };
    if (rpcRow) {
      void submitAnchor(newHash);
      revalidatePath(`/deal/${token}`);
      redirect(`/deal/${token}`);
    }
    if (attempt === RETRY_LIMIT - 1) return { error: ERROR_FLAG_RETRACT_FAILED };
  }

  return { error: ERROR_FLAG_RETRACT_FAILED };
}
