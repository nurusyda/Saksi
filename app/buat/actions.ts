'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import { supabaseServer } from '@/lib/supabase/server';
import { normalizePhone, phoneHash, buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { DealEventName } from '@/lib/db/transitions';
import { submitAnchor } from '@/lib/db/anchor';
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

export async function createDeal(
  _prev: CreateDealState,
  formData: FormData,
): Promise<CreateDealState> {
  const rawPhone = (formData.get('proposer_phone') as string | null)?.trim() ?? '';
  const proposerRole = (formData.get('proposer_role') as string | null) ?? '';
  const itemDesc = (formData.get('item_desc') as string | null)?.trim() ?? '';
  const amountRaw = (formData.get('amount_idr') as string | null) ?? '';
  const rekeningTujuan = (formData.get('rekening_tujuan') as string | null)?.trim() ?? '';
  const rekeningBank = (formData.get('rekening_bank') as string | null)?.trim() ?? '';
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

  const validRoles = ['PENJUAL', 'PEMBELI', 'PEMBERI_PINJAMAN', 'PEMINJAM', 'PEMILIK', 'PENYEWA', 'LAINNYA'];
  if (!validRoles.includes(proposerRole)) fieldErrors.proposer_role = 'Pilih peran Anda.';

  if (itemDesc.length < 5) fieldErrors.item_desc = 'Deskripsi terlalu singkat.';
  else if (itemDesc.length > 500) fieldErrors.item_desc = 'Deskripsi maksimal 500 karakter.';

  const amountIdr = Number(amountRaw);
  if (!Number.isFinite(amountIdr) || !Number.isInteger(amountIdr) || amountIdr < 1)
    fieldErrors.amount_idr = 'Nominal harus bilangan bulat lebih dari 0.';

  if (!rekeningTujuan) fieldErrors.rekening_tujuan = 'Nomor rekening wajib diisi.';
  if (!rekeningBank) fieldErrors.rekening_bank = 'Nama bank wajib diisi.';

  if (!deadline) {
    fieldErrors.deadline = 'Batas waktu wajib diisi.';
  } else {
    const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
    const todayWib = new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
    if (deadline <= todayWib) fieldErrors.deadline = 'Batas waktu harus di masa depan.';
  }

  if (!['GRATIS', 'LIMA_RIBU', 'BERMETERAI'].includes(tier))
    fieldErrors.tier = 'Tier tidak valid.';

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
    { name: DealEventName.CREATED, actor: 'PROPOSER', payload: null },
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
