'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
import { SYARAT_KETENTUAN_VERSION, SYARAT_KETENTUAN_HASH } from '@/lib/legal';
import { getAccountHistory, maskRekening } from '@/lib/db/accountHistory';
import { getTodayWib } from '@/lib/format';
import {
  ATTESTATIONS,
  ERROR_ATTESTATIONS_REQUIRED,
  ERROR_RATE_LIMIT,
  ERROR_PHONE_INVALID,
  ERROR_PARTY_SAVE_FAILED,
  ERROR_DEAL_SAVE_FAILED,
} from '@/lib/copy';

export type CreateDealState = {
  error?: string;
  fieldErrors?: Record<string, string>;
};

// "Notify me" checkboxes (feature_interest, migration 0012, extended by
// 0016 to also cover the paid-tier checkboxes below — those shipped in
// Phase 0.6 with no backend at all). Purpose-limited signup for
// not-yet-available deal types/tiers; never merged into marketing consent,
// never blocks deal creation.
type FeatureInterest = 'pinjam_meminjam' | 'sewa_menyewa' | 'tier_lima_ribu' | 'tier_bermeterai';

async function captureFeatureInterest(
  db: ReturnType<typeof supabaseServer>,
  pHash: string,
  formData: FormData,
): Promise<void> {
  const features: FeatureInterest[] = [];
  if (formData.get('interest_pinjam_meminjam') === 'on') features.push('pinjam_meminjam');
  if (formData.get('interest_sewa_menyewa') === 'on') features.push('sewa_menyewa');
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
  const itemDesc = (formData.get('item_desc') as string | null)?.trim() ?? '';
  const amountRaw = (formData.get('amount_idr') as string | null) ?? '';
  const rekeningTujuanRaw = (formData.get('rekening_tujuan') as string | null)?.trim() ?? '';
  const rekeningBankRaw = (formData.get('rekening_bank') as string | null)?.trim() ?? '';
  const deadline = (formData.get('deadline') as string | null)?.trim() ?? '';
  const tier = (formData.get('tier') as string | null) ?? 'GRATIS';

  // Attestation gate — must pass before any field validation or DB write
  const allAttestationsOn =
    ATTESTATIONS.every((_, i) => formData.get(`attest_${i}`) === 'on') &&
    formData.get('attest_tc') === 'on';
  if (!allAttestationsOn) return { error: ERROR_ATTESTATIONS_REQUIRED };

  const fieldErrors: Record<string, string> = {};

  let phoneE164 = '';
  try {
    phoneE164 = normalizePhone(rawPhone);
  } catch {
    fieldErrors.proposer_phone = ERROR_PHONE_INVALID;
  }

  // Only jual-beli roles are selectable in the UI (deal-type gating) — reject
  // anything else server-side too, since a hand-crafted POST could otherwise
  // still create a sewa-menyewa/pinjam-meminjam/lainnya deal the UI no longer
  // offers. Backend/schema/ROLE_PAIR/state machine unchanged.
  const validRoles = ['PENJUAL', 'PEMBELI'];
  if (!validRoles.includes(proposerRole)) fieldErrors.proposer_role = 'Pilih peran Anda.';

  if (itemDesc.length < 5) fieldErrors.item_desc = 'Deskripsi terlalu singkat.';
  else if (itemDesc.length > 500) fieldErrors.item_desc = 'Deskripsi maksimal 500 karakter.';

  const amountIdr = Number(amountRaw);
  if (!Number.isFinite(amountIdr) || !Number.isInteger(amountIdr) || amountIdr < 1)
    fieldErrors.amount_idr = 'Nominal harus bilangan bulat lebih dari 0.';

  // C1 — only Penjual has a destination account to offer at create time; a
  // Pembeli-proposed deal leaves these null until the joining Penjual
  // supplies them (see JoinDealForm.tsx / joinDeal, C2).
  const rekeningRequired = proposerRole === 'PENJUAL';
  if (rekeningRequired && !rekeningTujuanRaw) fieldErrors.rekening_tujuan = 'Nomor rekening wajib diisi.';
  if (rekeningRequired && !rekeningBankRaw) fieldErrors.rekening_bank = 'Nama bank wajib diisi.';
  const rekeningTujuan = rekeningRequired ? rekeningTujuanRaw : null;
  const rekeningBank = rekeningRequired ? rekeningBankRaw : null;

  if (!deadline) {
    fieldErrors.deadline = 'Batas waktu wajib diisi.';
  } else if (deadline <= getTodayWib()) {
    fieldErrors.deadline = 'Batas waktu harus di masa depan.';
  }

  // Only GRATIS is selectable in the UI (paid tiers have no radio input at all,
  // Phase 0.6) — reject anything else server-side too, since a direct form POST
  // could otherwise still submit a paid tier the UI no longer offers.
  if (tier !== 'GRATIS') fieldErrors.tier = 'Tier tidak valid.';

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const db = supabaseServer();

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

  // Section B — jenis-transaksi "notify me" checkboxes. Best-effort: a
  // failure here must never block deal creation, so errors are logged, not
  // returned.
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

  const dealId = randomUUID();
  const token = nanoid(21);

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
    })
    .single();

  if (dealErr || !deal) return { error: ERROR_DEAL_SAVE_FAILED };

  void submitAnchor(newHash);

  redirect(`/deal/${token}`);
}

export type AccountHistoryDisplay =
  | { status: 'found'; selesaiCount: number; tidakDipenuhiCount: number; sinceLabel: string; rekeningMasked: string }
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
    selesaiCount: result.history.selesaiCount,
    tidakDipenuhiCount: result.history.tidakDipenuhiCount,
    sinceLabel: result.history.sinceLabel,
    rekeningMasked: maskRekening(rekening),
  };
}
