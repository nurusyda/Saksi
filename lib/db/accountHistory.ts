// Shared account-history lookup — used by the ungated informational check on
// the create-deal form (Phase 0.5), the gated forced-check page (Phase 3),
// and (build step 4, B5) the public /cek page. Server-only: queries the raw
// `deals` table directly (its unmasked rekening_tujuan). anon/authenticated
// no longer have table-level SELECT on `deals` at all (closed in migration
// 0009 — public reads must go through the masked `deals_public` view), but
// this function still only ever runs behind the service-role client. Never
// call this from a client component; only from a Server Action.
//
// Matches on bank + rekening_tujuan together, not rekening_tujuan alone —
// each bank keeps its own independent account numbering, so two different
// banks can have accounts sharing the same number. Dropping bank from the
// match would risk attributing one account's history to an unrelated account
// at a different bank.
//
// GATE 1 fix (2026-07-20): tidakDipenuhiCount/klaimBerbedaAktifCount used to
// be counted directly off deals.status, with no awareness of
// flags.published_at — meaning the instant a report was filed, its rung-0
// claim was already visible here, bypassing the entire 14-day hak-jawab
// window and the publication feature flag built in migration 0023. Both
// existing callers (checkAccountHistory, getDealAccountHistory) only ever
// project selesaiCount/tidakDipenuhiCount/sinceLabel out of this function's
// return value, so fixing the gate here fixes it everywhere at once —
// nothing downstream needed to change.

import { supabaseServer } from '@/lib/supabase/server';

export interface AccountHistory {
  // §45 (2026-07-21) — fair-attribution buckets, computed from status + events
  // (see buildHistoryFromDeals). berhasil = money confirmed received (pembayaran
  // diterima) and/or goods confirmed (barang diterima); klaimBarang = buyer
  // disputed the goods (reflects on the seller); belumDikonfirmasi = buyer paid
  // but the seller never confirmed and the deal timed out (the naughty-seller
  // signal); klaimPembayaran = seller disputed the payment (reflects on the
  // BUYER — shown on /cek phone lookups, never on a seller's rekening card).
  berhasilCount: number;
  klaimBarangCount: number;
  belumDikonfirmasiCount: number;
  klaimPembayaranCount: number;
  sinceLabel: string; // e.g. "Maret 2026"
}

// A query failure must never be silently collapsed into "empty" — that would
// let a transient error hide real bad history behind the reassuring empty-state
// line, exactly the trust-washing-via-technical-failure risk this app exists
// to avoid. Callers must render a distinct message for 'error', not fall back
// to the empty-state warning or the found-history line.
export type AccountHistoryResult =
  | { status: 'found'; history: AccountHistory }
  | { status: 'empty' }
  | { status: 'error' };

// Mirrors the exact masking regex in the deals_public view (0001_initial_schema.sql):
// first 2 chars + repeated bullet + last 2 chars.
export function maskRekening(rekening: string): string {
  if (rekening.length <= 4) return rekening;
  const first = rekening.slice(0, 2);
  const last = rekening.slice(-2);
  const middle = '•'.repeat(rekening.length - 4);
  return `${first}${middle}${last}`;
}

// Extracted from lib/wa/send.ts (was a private logging-only helper there)
// for B5's public results display — same first-4+last-2 style, now also
// used for a phone the visitor typed into the /cek lookup form themselves.
// Masked even in that case: the results screen can be screenshotted/shared,
// and no public surface in this app shows a full phone number, including
// one shown back to the person who just typed it.
export function maskPhone(phoneE164: string): string {
  if (phoneE164.length <= 6) return phoneE164;
  const first = phoneE164.slice(0, 4);
  const last = phoneE164.slice(-2);
  return `${first}${'•'.repeat(phoneE164.length - 6)}${last}`;
}

type DealForHistory = { id: string; status: string; created_at: string };

// §45 (2026-07-21) — the rekening history, reworked around the realistic
// lifecycle and fair attribution. This is the SELLER's payout rekening (every
// deal here is one where this identifier is the proposer/seller), so the
// buckets answer one question for the next buyer: "is it safe to pay INTO
// this account?"
//
// The outcome of a deal is computed from its status + its events, not from
// status alone, because "seller confirmed receipt" is a success even when the
// buyer never came back to confirm goods, and a payment dispute must NOT be
// counted against the seller (it is the buyer's payment in question, not the
// seller's conduct — see the fair-attribution design). The event set needed:
//   RECEIPT_CONFIRMED  — seller confirmed the money landed (success pivot)
//   BARANG_TIDAK_SESUAI — buyer disputed the goods (reflects on the seller)
//   DANA_BELUM_MASUK   — seller disputed the payment (reflects on the BUYER;
//                        excluded from the seller's rekening record)
async function buildHistoryFromDeals(
  db: ReturnType<typeof supabaseServer>,
  deals: DealForHistory[],
): Promise<AccountHistoryResult> {
  if (deals.length === 0) return { status: 'empty' };

  const dealIds = deals.map((d) => d.id);
  const { data: events, error: eventsErr } = await db
    .from('deal_events')
    .select('deal_id, event')
    .in('deal_id', dealIds)
    .in('event', ['RECEIPT_CONFIRMED', 'BARANG_TIDAK_SESUAI', 'DANA_BELUM_MASUK']);
  if (eventsErr) return { status: 'error' };

  const has = new Map<string, Set<string>>();
  for (const e of events ?? []) {
    let s = has.get(e.deal_id);
    if (!s) has.set(e.deal_id, (s = new Set()));
    s.add(e.event);
  }
  const dealHas = (id: string, ev: string) => has.get(id)?.has(ev) ?? false;

  // Published breach flags (the gated publication layer) still fold into the
  // goods-concern bucket — a published "tidak dipenuhi" or "klaim berbeda"
  // is a delivery breach against the seller.
  const breachIds = deals.filter((d) => d.status === 'TIDAK_DIPENUHI' || d.status === 'SENGKETA').map((d) => d.id);
  const publishedBreach = new Set<string>();
  if (breachIds.length > 0) {
    const { data: flags, error: flagsErr } = await db
      .from('flags')
      .select('deal_id, published_at')
      .in('deal_id', breachIds);
    if (flagsErr) return { status: 'error' };
    for (const f of flags ?? []) if (f.published_at) publishedBreach.add(f.deal_id);
  }

  let berhasilCount = 0; // pembayaran diterima + barang diterima
  let klaimBarangCount = 0; // buyer disputed goods (concern on the seller)
  let belumDikonfirmasiCount = 0; // buyer paid, seller ghosted (weak)
  let klaimPembayaranCount = 0; // seller disputed payment (the BUYER's issue — tracked, not a seller concern)

  for (const d of deals) {
    const receiptConfirmed = dealHas(d.id, 'RECEIPT_CONFIRMED');
    const goodsDisputed = dealHas(d.id, 'BARANG_TIDAK_SESUAI');
    const paymentDisputed = dealHas(d.id, 'DANA_BELUM_MASUK');

    if (d.status === 'SELESAI') {
      berhasilCount++; // barang diterima
    } else if (goodsDisputed || publishedBreach.has(d.id)) {
      klaimBarangCount++;
    } else if (d.status === 'DIKONFIRMASI_TERIMA' || (d.status === 'KEDALUWARSA' && receiptConfirmed)) {
      berhasilCount++; // pembayaran diterima — seller confirmed money, no goods complaint
    } else if (paymentDisputed) {
      klaimPembayaranCount++; // the buyer's payment is in question, not the seller
    } else if (d.status === 'KEDALUWARSA') {
      belumDikonfirmasiCount++; // paid, seller never confirmed, timed out
    }
    // DISEPAKATI / DIBAYAR_DIKLAIM still in-flight (not timed out) → not counted
  }

  const earliest = deals.reduce((min, d) => (d.created_at < min ? d.created_at : min), deals[0].created_at);
  const sinceLabel = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(earliest));

  return {
    status: 'found',
    history: { berhasilCount, klaimBarangCount, belumDikonfirmasiCount, klaimPembayaranCount, sinceLabel },
  };
}

export async function getAccountHistory(bank: string, rekening: string): Promise<AccountHistoryResult> {
  const db = supabaseServer();
  const { data, error } = await db
    .from('deals')
    .select('id, status, created_at')
    .eq('rekening_bank', bank)
    .eq('rekening_tujuan', rekening)
    .neq('status', 'DRAF');

  if (error) return { status: 'error' };
  return buildHistoryFromDeals(db, data ?? []);
}

// QRIS parallel to getAccountHistory (migration 0036) — same fair-attribution
// buckets, keyed on qris_nmid instead of bank+rekening_tujuan. A separate
// namespace, not a merge: a rekening and an NMID are different identity
// primitives (see lib/qris/decode.ts's header comment), so there is no
// shared key to join the two payment methods' history on even for the same
// real-world seller.
export async function getAccountHistoryByNmid(nmid: string): Promise<AccountHistoryResult> {
  const db = supabaseServer();
  const { data, error } = await db
    .from('deals')
    .select('id, status, created_at')
    .eq('payment_method', 'QRIS')
    .eq('qris_nmid', nmid)
    .neq('status', 'DRAF');

  if (error) return { status: 'error' };
  return buildHistoryFromDeals(db, data ?? []);
}

// B5 — public /cek lookup by phone. phoneHash is computed by the caller
// (server action) before this is ever called; the raw phone number never
// reaches this function or any query log. A phone can appear as either
// proposer or counterpart across different deals, so this matches both
// party slots via their parties.phone_hash.
export async function getAccountHistoryByPhoneHash(phoneHash: string): Promise<AccountHistoryResult> {
  const db = supabaseServer();
  // Bug found by monster_check: this used to fetch a single `parties` row via
  // .maybeSingle(), but a phone gets its own party row per deal it's in
  // (proposer or counterpart) — any phone with more than one deal has more
  // than one matching row, and .maybeSingle() errors the instant a second row
  // exists. Fetch every matching row instead, so an active phone's lookup
  // works exactly like an inactive one instead of failing loudest for the
  // most-used numbers.
  const { data: parties, error: partiesErr } = await db
    .from('parties')
    .select('id')
    .eq('phone_hash', phoneHash);

  if (partiesErr) return { status: 'error' };
  if (!parties || parties.length === 0) return { status: 'empty' };

  // Two plain .in() queries merged here, not a single .or()-with-nested-.in()
  // filter: PostgREST's or-filter mini-language doesn't use SQL-style value
  // quoting (unlike what monster_check's first pass suggested), so an
  // interpolated `.or('proposer_id.in.(...),counterpart_id.in.(...)')` string
  // would either be correct or subtly wrong depending on paren-nesting
  // behavior that isn't worth betting on here. Two typed queries sidestep the
  // question entirely. A party row belongs to exactly one deal/slot, so the
  // two result sets can't overlap in practice, but dealsById still dedupes
  // defensively rather than assuming that invariant holds forever.
  const partyIds = parties.map((p) => p.id);
  const [proposerDeals, counterpartDeals] = await Promise.all([
    db.from('deals').select('id, status, created_at').in('proposer_id', partyIds).neq('status', 'DRAF'),
    db.from('deals').select('id, status, created_at').in('counterpart_id', partyIds).neq('status', 'DRAF'),
  ]);

  if (proposerDeals.error || counterpartDeals.error) return { status: 'error' };

  const dealsById = new Map<string, DealForHistory>();
  for (const d of [...(proposerDeals.data ?? []), ...(counterpartDeals.data ?? [])]) {
    dealsById.set(d.id, d);
  }

  return buildHistoryFromDeals(db, Array.from(dealsById.values()));
}
