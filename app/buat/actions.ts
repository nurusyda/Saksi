'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { setPartySession } from '@/lib/db/partySession';
import { SYARAT_KETENTUAN_VERSION, SYARAT_KETENTUAN_HASH } from '@/lib/legal';
import { getAccountHistory, maskRekening } from '@/lib/db/accountHistory';
import { getRekeningLedger, isLedgerDetailEnabled, type LedgerResult } from '@/lib/db/ledger';
import { getDefaultDeadlineWib } from '@/lib/format';
import { uploadQrisImage } from '@/lib/db/storage';
import { decodeQrisImage } from '@/lib/qris/decode';
import {
  ERROR_ATTESTATIONS_REQUIRED,
  ERROR_RATE_LIMIT,
  ERROR_PHONE_INVALID,
  ERROR_PARTY_SAVE_FAILED,
  ERROR_DEAL_SAVE_FAILED,
  ERROR_QRIS_FILE_REQUIRED,
  ERROR_QRIS_NO_QR_FOUND,
  ERROR_QRIS_INVALID_CHECKSUM,
  ERROR_QRIS_NOT_QRIS,
  ERROR_QRIS_UPLOAD_FAILED,
} from '@/lib/copy';

export type CreateDealState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

type PaymentMethod = 'REKENING' | 'QRIS';

// "Notify me" checkboxes (feature_interest, migration 0012, extended by
// 0016 to also cover the paid-tier checkboxes below — those shipped in
// Phase 0.6 with no backend at all). Purpose-limited signup for
// not-yet-available tiers; never merged into marketing consent, never
// blocks deal creation. The jenis-transaksi (deal-type) interest checkboxes
// this used to also capture (pinjam_meminjam/sewa_menyewa) were removed
// along with that whole section of the form (UX audit, 2026-07-20) — the
// feature_interest table and its existing rows are untouched, this just
// stops writing those two values going forward.
type FeatureInterest = 'tier_lima_ribu' | 'tier_bermeterai';

async function captureFeatureInterest(
  db: ReturnType<typeof supabaseServer>,
  pHash: string,
  formData: FormData,
): Promise<void> {
  const features: FeatureInterest[] = [];
  if (formData.get('interest_tier_lima_ribu') === 'on') features.push('tier_lima_ribu');
  if (formData.get('interest_tier_bermeterai') === 'on') features.push('tier_bermeterai');
  if (features.length === 0) return;

  const { error } = await db
    .from('feature_interest')
    .upsert(
      features.map((feature) => ({ phone_hash: pHash, feature })),
      { onConflict: 'phone_hash,feature', ignoreDuplicates: true },
    );
  if (error) console.error('feature_interest upsert failed', error);
}

export async function createDeal(
  _prev: CreateDealState,
  formData: FormData,
): Promise<CreateDealState> {
  const rawPhone = (formData.get('proposer_phone') as string | null)?.trim() ?? '';
  const proposerRole = (formData.get('proposer_role') as string | null) ?? '';
  const itemTitle = (formData.get('item_title') as string | null)?.trim() ?? '';
  const itemDetail = (formData.get('item_detail') as string | null)?.trim() ?? '';
  const amountRaw = (formData.get('amount_idr') as string | null) ?? '';
  const rekeningTujuanRaw = (formData.get('rekening_tujuan') as string | null)?.trim() ?? '';
  const rekeningBankRaw = (formData.get('rekening_bank') as string | null)?.trim() ?? '';
  // migration 0036 — seller-chosen alternative to rekening, not a replacement.
  // Defaults to REKENING so a stale client / direct POST without the field
  // behaves exactly as it did before this existed.
  const paymentMethod: PaymentMethod = formData.get('payment_method') === 'QRIS' ? 'QRIS' : 'REKENING';
  const qrisFile = formData.get('qris_image') as File | null;
  // Auto-derived (2026-07-21 simplification pass), no longer a form field —
  // see getDefaultDeadlineWib. PERPANJANGAN remains the witnessed way to
  // change it after creation.
  const deadline = getDefaultDeadlineWib();
  const tier = (formData.get('tier') as string | null) ?? 'GRATIS';

  // Attestation gate — must pass before any field validation or DB write
  // Single T&C consent checkbox covers the four pernyataan (displayed as fine
  // print above it) — see JoinDealForm's 2026-07-20 design pass for the full
  // reasoning (same consent model, same change applied to both forms).
  if (formData.get('attest_tc') !== 'on') return { error: ERROR_ATTESTATIONS_REQUIRED };

  const fieldErrors: Record<string, string> = {};

  let phoneE164 = '';
  try {
    phoneE164 = normalizePhone(rawPhone);
  } catch {
    fieldErrors.proposer_phone = ERROR_PHONE_INVALID;
  }

  // SAKSI is a seller-invoice tool (copy-id.md §20/§22): the proposer is
  // always PENJUAL. This used to accept PEMBELI too "defensively" — that
  // was the root cause of a 2026-07-21 code-review finding (a UI change
  // deleted the counterpart's ability to complete a PEMBELI-proposed join,
  // while this validation still silently allowed creating one). Rather than
  // keep patching the UI around a backend door left open for a case the
  // product doesn't use, the door is closed here: PEMBELI-proposed deals are
  // no longer created, full stop. This makes "every counterpart is the
  // payer" (assumed by ~14 call sites across paymentActions.ts,
  // breachActions.ts, the deadline-sweep cron, and every status panel) an
  // enforced invariant instead of a UI default with a false premise.
  const validRoles = ['PENJUAL'];
  if (!validRoles.includes(proposerRole)) fieldErrors.proposer_role = 'Pilih peran Anda.';

  if (itemTitle.length < 2) fieldErrors.item_title = 'Wajib diisi.';
  else if (itemTitle.length > 80) fieldErrors.item_title = 'Maksimal 80 karakter.';
  if (itemDetail.length > 400) fieldErrors.item_detail = 'Maksimal 400 karakter.';

  // Composed into the single item_desc column this has always been — title
  // and detail are a UI-level split (2026-07-20 UX audit), not a schema
  // change. Period join, never an em dash, matching the no-em-dash rule for
  // customer-facing copy; omitted entirely when detail is blank.
  const itemDesc = itemDetail ? `${itemTitle}. ${itemDetail}` : itemTitle;

  const amountIdr = Number(amountRaw);
  if (!Number.isFinite(amountIdr) || !Number.isInteger(amountIdr) || amountIdr < 1)
    fieldErrors.amount_idr = 'Nominal harus bilangan bulat lebih dari 0.';

  // C1 — only Penjual has a destination account to offer at create time; a
  // Pembeli-proposed deal leaves these null until the joining Penjual
  // supplies them (see JoinDealForm.tsx / joinDeal, C2).
  const rekeningRequired = proposerRole === 'PENJUAL' && paymentMethod === 'REKENING';
  if (rekeningRequired && !rekeningTujuanRaw) fieldErrors.rekening_tujuan = 'Nomor rekening wajib diisi.';
  if (rekeningRequired && !rekeningBankRaw) fieldErrors.rekening_bank = 'Nama bank wajib diisi.';
  const rekeningTujuan = rekeningRequired ? rekeningTujuanRaw : null;
  const rekeningBank = rekeningRequired ? rekeningBankRaw : null;

  const qrisRequired = proposerRole === 'PENJUAL' && paymentMethod === 'QRIS';
  if (qrisRequired && (!qrisFile || qrisFile.size === 0)) {
    fieldErrors.qris_image = ERROR_QRIS_FILE_REQUIRED;
  }

  // Only GRATIS is selectable in the UI (paid tiers have no radio input at all,
  // Phase 0.6) — reject anything else server-side too, since a direct form POST
  // could otherwise still submit a paid tier the UI no longer offers.
  if (tier !== 'GRATIS') fieldErrors.tier = 'Tier tidak valid.';

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const db = supabaseServer();

  // dealId generated here (not at its old spot further down) so the QRIS
  // upload below — which needs a deal id for its storage path — has one to
  // use before any party/rate-limit writes happen. Same client-generated-UUID
  // pattern as before (crypto.randomUUID(), so the id is known before the
  // canonical hash is computed and before the atomic RPC write).
  const dealId = randomUUID();
  const token = nanoid(21);

  let qrisNmid: string | null = null;
  let qrisMerchantName: string | null = null;
  let qrisMerchantCity: string | null = null;
  let qrisImagePath: string | null = null;

  if (qrisRequired && qrisFile) {
    const uploaded = await uploadQrisImage(db, dealId, qrisFile);
    if (!uploaded) return { fieldErrors: { qris_image: ERROR_QRIS_UPLOAD_FAILED } };

    const decoded = await decodeQrisImage(uploaded.bytes);
    if (decoded.status !== 'ok') {
      // Found by monster_check: a decode failure returned an error without
      // removing the file just uploaded — an orphaned storage object with no
      // deal ever referencing it (the deal row hasn't been inserted yet at
      // this point in the flow). Best-effort: a cleanup failure here must not
      // block the user from seeing/retrying the actual error.
      await db.storage.from('bukti').remove([uploaded.storagePath]).catch(() => {});
      const message =
        decoded.status === 'no_qr_found'
          ? ERROR_QRIS_NO_QR_FOUND
          : decoded.status === 'invalid_checksum'
            ? ERROR_QRIS_INVALID_CHECKSUM
            : ERROR_QRIS_NOT_QRIS;
      return { fieldErrors: { qris_image: message } };
    }
    if (!decoded.fields.merchantName) {
      // Merchant name is the field the buyer actually reads to recognize the
      // seller — a payload that decodes but carries no name isn't usable,
      // same "don't proceed on an unusable read" posture as the OCR path.
      await db.storage.from('bukti').remove([uploaded.storagePath]).catch(() => {});
      return { fieldErrors: { qris_image: ERROR_QRIS_NOT_QRIS } };
    }

    qrisNmid = decoded.fields.nmid;
    qrisMerchantName = decoded.fields.merchantName;
    qrisMerchantCity = decoded.fields.merchantCity;
    qrisImagePath = uploaded.storagePath;
  }

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

  // Paid-tier "notify me" checkboxes. Best-effort: a failure here must never
  // block deal creation, so errors are logged, not returned.
  await captureFeatureInterest(db, pHash, formData);

  // Rate limit: max 20 deals created per party per UTC day.
  // Known check-then-act race: two concurrent requests can both pass the count
  // check before either inserts, allowing a brief burst over 20. Blast radius is
  // small at this threshold. Real fix: move the count inside create_deal_with_event
  // as SELECT count(*) ... FOR UPDATE before the INSERT (serialized in the RPC
  // transaction). Tracked in SESSION_LOG.md [DEFERRED].
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from('deals')
    .select('*', { count: 'exact', head: true })
    .eq('proposer_id', party.id)
    .gte('created_at', todayUtc.toISOString());
  if ((count ?? 0) >= 20) return { error: ERROR_RATE_LIMIT };

  // Pre-compute hash before the write. created_at is excluded from the canonical
  // payload so the hash is deterministic regardless of server clock at insert time.
  const virtualDeal = {
    id: dealId,
    token,
    tier,
    proposer_id: party.id,
    counterpart_id: null,
    proposer_role: proposerRole,
    item_desc: itemDesc,
    amount_idr: amountIdr,
    rekening_tujuan: rekeningTujuan,
    rekening_bank: rekeningBank,
    payment_method: paymentMethod,
    qris_nmid: qrisNmid,
    qris_merchant_name: qrisMerchantName,
    qris_merchant_city: qrisMerchantCity,
    deadline,
    status: 'DRAF',
    meterai_applied: false,
  };
  const canonical = buildCanonicalPayload(
    virtualDeal,
    {
      name: DealEventName.CREATED,
      actor: 'PROPOSER',
      payload: { tnc_version: SYARAT_KETENTUAN_VERSION, tnc_hash: SYARAT_KETENTUAN_HASH },
    },
    null,
  );
  const newHash = hashDeal(canonical);

  // Atomic: INSERT deals + INSERT deal_events in one PL/pgSQL transaction.
  // If either fails, both roll back — no orphan deal row without an event.
  const { data: deal, error: dealErr } = await db
    .rpc('create_deal_with_event', {
      p_id: dealId,
      p_token: token,
      p_tier: tier,
      p_proposer_id: party.id,
      p_proposer_role: proposerRole,
      p_item_desc: itemDesc,
      p_amount_idr: amountIdr,
      p_rekening_tujuan: rekeningTujuan,
      p_rekening_bank: rekeningBank,
      p_deadline: deadline,
      p_new_hash: newHash,
      p_payment_method: paymentMethod,
      p_qris_nmid: qrisNmid,
      p_qris_merchant_name: qrisMerchantName,
      p_qris_merchant_city: qrisMerchantCity,
      p_qris_image_path: qrisImagePath,
    })
    .single();

  if (dealErr || !deal) {
    // Log only the Postgres error code, never the full error object — its
    // `details` field can embed submitted values (e.g. a constraint
    // violation quoting rekening_tujuan), which would put PII in server logs.
    if (dealErr) console.error('create_deal_with_event failed', dealErr.code);
    return { error: ERROR_DEAL_SAVE_FAILED };
  }

  void submitAnchor(newHash);

  // Mark this browser as the proposer so the deal page hides the join form.
  // The cookie is scoped to this specific token — creating another deal sets
  // a different cookie, so proposer-of-A isn't mistaken for proposer-of-B.
  const cookieStore = await cookies();
  cookieStore.set(`saksi_proposer_${token}`, '1', { maxAge: 86400, path: '/', sameSite: 'lax', secure: true });

  // 2026-07-20 design (data-model.md): with the accept step folded away,
  // this is now the proposer's only round trip before DISEPAKATI — set
  // their party session here (mirrors joinDeal doing the same for the
  // counterpart) so IdentifyPartyGate can skip re-asking their phone on
  // every subsequent status screen, same as it already does today once a
  // party has identified themselves once.
  await setPartySession(token, 'proposer');

  redirect(`/deal/${token}`);
}

export type AccountHistoryDisplay =
  | {
      status: 'found';
      berhasilCount: number;
      klaimBarangCount: number;
      belumDikonfirmasiCount: number;
      sinceLabel: string;
      rekeningMasked: string;
      ledgerEnabled: boolean;
    }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'idle' };

// Called directly from a client component (not bound to a form) once both
// bank + rekening are filled in. Informational only — never blocks submission
// (that's Phase 3's gated forced-check page, a different surface).
export async function checkAccountHistory(
  bank: string,
  rekening: string,
): Promise<AccountHistoryDisplay> {
  if (!bank || !rekening) return { status: 'idle' };
  const result = await getAccountHistory(bank, rekening);
  if (result.status === 'error') return { status: 'error' };
  if (result.status === 'empty') return { status: 'empty' };
  return {
    status: 'found',
    berhasilCount: result.history.berhasilCount,
    klaimBarangCount: result.history.klaimBarangCount,
    belumDikonfirmasiCount: result.history.belumDikonfirmasiCount,
    sinceLabel: result.history.sinceLabel,
    rekeningMasked: maskRekening(rekening),
    ledgerEnabled: isLedgerDetailEnabled(),
  };
}

// B6/ledger design pass — client already holds bank+rekening locally (its
// own form fields), so this just wraps getRekeningLedger directly, same
// shape as checkAccountHistory above.
export async function getRekeningLedgerAction(bank: string, rekening: string): Promise<LedgerResult> {
  return getRekeningLedger(bank, rekening);
}
