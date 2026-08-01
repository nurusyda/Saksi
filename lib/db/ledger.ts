// Full transaction ledger + reputation-gaming signals (rekening/phone
// drill-down) — build step 5, per the design pass in data-model.md's
// section of the same name (confirmed 2026-07-20). Deliberately NOT a
// standalone lookup module: every export here is called only from behind an
// already-rendered account-history result (see the three call sites'
// comments), never from a route of its own — see that design section's
// "Entry-point mechanism" note for why there's no new page at all.
//
// Bounded deal universe mirrors accountHistory.ts's buildHistoryFromDeals
// exactly (same GATE 1 gate): only deals already contributing to the
// existing 8-bucket aggregate count. SENGKETA-status deals (an active,
// unresolved dispute still inside its response window) are excluded
// entirely, same as the aggregate — nothing about an in-flight dispute is
// visible here before publication either.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';
import { maskRekening } from '@/lib/db/accountHistory';
import { checkLookupRateLimit } from '@/lib/db/lookupRateLimit';

const LEDGER_ROW_LIMIT = 50;

export function isLedgerDetailEnabled(): boolean {
  return process.env.LEDGER_DETAIL_ENABLED === 'true';
}

// §45 — same fair-attribution buckets as accountHistory.ts's aggregate, so the
// drill-down and the counts it expands from can never disagree.
export type LedgerBucket =
  | 'BERHASIL'
  | 'KLAIM_BARANG'
  | 'BELUM_DIKONFIRMASI'
  | 'KLAIM_PEMBAYARAN';

export interface LedgerRow {
  bucket: LedgerBucket;
  dateIso: string;
  itemDesc: string;
  amountIdr: number;
  bank: string;
  rekeningMasked: string;
  // The OTHER party's phone_hash, tier-gated exactly like the flag ladder
  // Phone hash is reserved for future seller-account-tier gating. All deals
  // are standard (GRATIS) today, so this is always null for now.
  counterpartPhoneHash: string | null;
}

export interface LedgerSignals {
  concentrationLine: string | null;
  velocityLine: string | null;
  volumeLine: string | null;
}

export type LedgerResult =
  | { status: 'disabled' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'found'; rows: LedgerRow[]; signals: LedgerSignals };

type RawDeal = {
  id: string;
  status: string;
  tier: string;
  proposer_id: string;
  counterpart_id: string | null;
  item_desc: string;
  amount_idr: number;
  // Exactly one of {rekening_tujuan+rekening_bank} or {qris_merchant_name} is
  // set, per migration 0036's payment_method split — never both, never
  // neither, for any deal past DRAF.
  rekening_tujuan?: string | null;
  rekening_bank?: string | null;
  qris_merchant_name?: string | null;
  created_at: string;
};

// A deal annotated with "who the OTHER party is" relative to whatever this
// ledger is about. The two callers below resolve this differently (rekening
// ownership is per-deal-role, a phone lookup is per-deal-party-membership),
// so resolution happens at each call site rather than inside one shared
// function trying to encode both rules through a single comparison.
type AnnotatedDeal = RawDeal & { otherPartyId: string | null };

// §45 — mirrors accountHistory.ts's buildHistoryFromDeals classification
// exactly, computed from status + events rather than status alone. `ev` is the
// set of this deal's events; `publishedBreach` is true for a published
// TIDAK_DIPENUHI/SENGKETA flag. Returns null for in-flight/uncounted deals
// (DIAJUKAN, DISEPAKATI, a fresh DIBAYAR_DIKLAIM with no dispute yet).
function resolveBucket(status: string, ev: Set<string>, publishedBreach: boolean): LedgerBucket | null {
  const receiptConfirmed = ev.has('RECEIPT_CONFIRMED');
  const goodsDisputed = ev.has('BARANG_TIDAK_SESUAI');
  const paymentDisputed = ev.has('DANA_BELUM_MASUK');

  if (status === 'SELESAI') return 'BERHASIL';
  if (goodsDisputed || publishedBreach) return 'KLAIM_BARANG';
  if (status === 'DIKONFIRMASI_TERIMA' || (status === 'KEDALUWARSA' && receiptConfirmed)) return 'BERHASIL';
  if (paymentDisputed) return 'KLAIM_PEMBAYARAN';
  if (status === 'KEDALUWARSA') return 'BELUM_DIKONFIRMASI';
  return null; // in-flight / uncounted
}

// `includePaymentDisputes` false in rekening mode (the seller's card never
// shows a buyer's payment dispute — same fair-attribution rule as the
// aggregate), true in phone mode where the number can be the payer.
async function assembleLedger(
  db: SupabaseClient,
  deals: AnnotatedDeal[],
  includePaymentDisputes: boolean,
): Promise<LedgerResult> {
  if (deals.length === 0) return { status: 'empty' };

  // Published breach flags fold into KLAIM_BARANG, same as the aggregate.
  const breachIds = deals.filter((d) => d.status === 'TIDAK_DIPENUHI' || d.status === 'SENGKETA').map((d) => d.id);
  const publishedBreach = new Set<string>();
  if (breachIds.length > 0) {
    const { data: flags, error } = await db.from('flags').select('deal_id, published_at').in('deal_id', breachIds);
    if (error) return { status: 'error' };
    for (const f of flags ?? []) if (f.published_at) publishedBreach.add(f.deal_id);
  }

  // Every event for every candidate deal in one query — needed both to
  // classify (RECEIPT_CONFIRMED / BARANG_TIDAK_SESUAI / DANA_BELUM_MASUK) and
  // for each row's display date (latest event) + the velocity signal's
  // ACCEPTED timestamp.
  const allDealIds = deals.map((d) => d.id);
  const { data: events } = await db
    .from('deal_events')
    .select('deal_id, event, created_at')
    .in('deal_id', allDealIds)
    .order('created_at', { ascending: true });

  const latestEventByDeal = new Map<string, string>();
  const acceptedAtByDeal = new Map<string, string>();
  const eventSetByDeal = new Map<string, Set<string>>();
  for (const e of events ?? []) {
    latestEventByDeal.set(e.deal_id, e.created_at); // ascending order: last write wins = latest
    if (e.event === 'ACCEPTED') acceptedAtByDeal.set(e.deal_id, e.created_at);
    let s = eventSetByDeal.get(e.deal_id);
    if (!s) eventSetByDeal.set(e.deal_id, (s = new Set()));
    s.add(e.event);
  }

  const eligible = deals
    .map((d) => ({
      deal: d,
      bucket: resolveBucket(d.status, eventSetByDeal.get(d.id) ?? new Set(), publishedBreach.has(d.id)),
    }))
    .filter((x): x is { deal: AnnotatedDeal; bucket: LedgerBucket } => x.bucket !== null)
    .filter((x) => includePaymentDisputes || x.bucket !== 'KLAIM_PEMBAYARAN');

  if (eligible.length === 0) return { status: 'empty' };

  // Batched phone_hash lookup for future seller-account-tier-gated rows.
  // All deals are GRATIS today, so partyIdsNeeded is always empty for now.
  const partyIdsNeeded = new Set<string>();
  for (const { deal } of eligible) {
    if (deal.tier !== 'GRATIS' && deal.otherPartyId) partyIdsNeeded.add(deal.otherPartyId);
  }
  const phoneHashById = new Map<string, string>();
  if (partyIdsNeeded.size > 0) {
    const { data: parties } = await db.from('parties').select('id, phone_hash').in('id', Array.from(partyIdsNeeded));
    for (const p of parties ?? []) phoneHashById.set(p.id, p.phone_hash);
  }

  const rows: LedgerRow[] = eligible
    .sort((a, b) => (latestEventByDeal.get(b.deal.id) ?? '').localeCompare(latestEventByDeal.get(a.deal.id) ?? ''))
    .slice(0, LEDGER_ROW_LIMIT)
    .map(({ deal, bucket }) => ({
      bucket,
      dateIso: latestEventByDeal.get(deal.id) ?? deal.created_at,
      itemDesc: deal.item_desc,
      amountIdr: Number(deal.amount_idr),
      // rekeningMasked/bank double as the QRIS display fields when this deal
      // has no rekening at all — neither is currently rendered by
      // LedgerDetail.tsx (dateIso/itemDesc/amountIdr/counterpartPhoneHash are
      // the only fields formatLedgerRow consumes today), but kept populated
      // and truthful rather than left blank in case that changes.
      bank: deal.rekening_bank ?? 'QRIS',
      rekeningMasked: deal.rekening_tujuan ? maskRekening(deal.rekening_tujuan) : deal.qris_merchant_name ?? '',
      counterpartPhoneHash:
        deal.tier !== 'GRATIS' && deal.otherPartyId ? phoneHashById.get(deal.otherPartyId) ?? null : null,
    }));

  const signals = computeSignals(
    eligible.map((x) => x.deal),
    latestEventByDeal,
    acceptedAtByDeal,
  );

  return { status: 'found', rows, signals };
}

// Signals 1-3, precise thresholds per the confirmed design pass. All three
// are proposed defaults, not fixed constants elsewhere in the app — tune
// here if they need adjusting later.
function computeSignals(
  deals: AnnotatedDeal[],
  latestEventByDeal: Map<string, string>,
  acceptedAtByDeal: Map<string, string>,
): LedgerSignals {
  const selesai = deals.filter((d) => d.status === 'SELESAI');

  const counterpartCounts = new Map<string, AnnotatedDeal[]>();
  for (const d of selesai) {
    if (!d.otherPartyId) continue;
    const list = counterpartCounts.get(d.otherPartyId) ?? [];
    list.push(d);
    counterpartCounts.set(d.otherPartyId, list);
  }
  let topCounterpart: { id: string; deals: AnnotatedDeal[] } | null = null;
  for (const [id, list] of counterpartCounts) {
    if (!topCounterpart || list.length > topCounterpart.deals.length) topCounterpart = { id, deals: list };
  }

  let concentrationLine: string | null = null;
  let velocityLine: string | null = null;
  if (selesai.length >= 3 && topCounterpart && topCounterpart.deals.length / selesai.length >= 0.6) {
    concentrationLine = `${topCounterpart.deals.length} dari ${selesai.length} kesepakatan selesai dengan pihak yang sama.`;

    // Signal 2 — a qualifier on signal 1's counterpart, never an independent
    // pick (design doc: avoids two signals disagreeing about who "the same
    // pair" is). ACCEPTED -> terminal (the row's own latest-event date, which
    // for a SELESAI deal is FULFILLMENT_CONFIRMED) under 1 hour.
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const fastCount = topCounterpart.deals.filter((d) => {
      const acceptedAt = acceptedAtByDeal.get(d.id);
      const terminalAt = latestEventByDeal.get(d.id);
      if (!acceptedAt || !terminalAt) return false;
      return new Date(terminalAt).getTime() - new Date(acceptedAt).getTime() < ONE_HOUR_MS;
    }).length;
    if (fastCount >= 2) {
      velocityLine = `${fastCount} dari kesepakatan tersebut selesai dalam waktu kurang dari 1 jam.`;
    }
  }

  let volumeLine: string | null = null;
  if (deals.length > 0) {
    const earliest = deals.reduce((min, d) => (d.created_at < min ? d.created_at : min), deals[0].created_at);
    const windowMs = 48 * 60 * 60 * 1000;
    const within48h = selesai.filter(
      (d) => new Date(d.created_at).getTime() - new Date(earliest).getTime() <= windowMs,
    );
    if (within48h.length >= 5) {
      volumeLine = `${within48h.length} kesepakatan selesai dalam 48 jam pertama sejak tercatat.`;
    }
  }

  return { concentrationLine, velocityLine, volumeLine };
}

// Rekening-mode: "other party" is whichever slot is NOT the payee for that
// specific deal. Resolved per-deal via proposer_role (not a single global
// owner id) — the same literal rekening can be entered by different
// proposer phone_hashes across different deals, which is exactly the
// cross-linkage pattern this feature exists to surface, not an edge case to
// collapse away.
export async function getRekeningLedger(bank: string, rekening: string): Promise<LedgerResult> {
  if (!isLedgerDetailEnabled()) return { status: 'disabled' };
  const db = supabaseServer();
  // Anti-enumeration, same shared budget as /cek's base lookup (see
  // lib/db/lookupRateLimit.ts's header comment) — this reads meaningfully
  // more per call than the aggregate check does, so it gets the same guard
  // even when the caller (getDealLedger) is already identity-verified
  // through a different, deal-scoped limiter; harmless overlap, not a gap.
  if (!(await checkLookupRateLimit(db))) return { status: 'error' };
  const { data, error } = await db
    .from('deals')
    .select('id, status, tier, proposer_id, counterpart_id, proposer_role, item_desc, amount_idr, rekening_tujuan, rekening_bank, created_at')
    .eq('rekening_bank', bank)
    .eq('rekening_tujuan', rekening)
    .neq('status', 'DRAF');
  if (error) return { status: 'error' };

  const annotated: AnnotatedDeal[] = (data ?? []).map((d) => ({
    ...d,
    otherPartyId: d.proposer_role === 'PENJUAL' ? d.counterpart_id : d.proposer_id,
  }));
  // Rekening mode: a seller's card never surfaces a buyer's payment dispute.
  return assembleLedger(db, annotated, false);
}

// QRIS parallel to getRekeningLedger (migration 0036), keyed on qris_nmid —
// a separate identity namespace from rekening+bank, not a merge (see
// lib/qris/decode.ts). Same "seller's card never shows a buyer's payment
// dispute" rule as the rekening path.
export async function getQrisLedger(nmid: string): Promise<LedgerResult> {
  if (!isLedgerDetailEnabled()) return { status: 'disabled' };
  const db = supabaseServer();
  if (!(await checkLookupRateLimit(db))) return { status: 'error' };
  const { data, error } = await db
    .from('deals')
    .select('id, status, tier, proposer_id, counterpart_id, proposer_role, item_desc, amount_idr, qris_merchant_name, created_at')
    .eq('payment_method', 'QRIS')
    .eq('qris_nmid', nmid)
    .neq('status', 'DRAF');
  if (error) return { status: 'error' };

  const annotated: AnnotatedDeal[] = (data ?? []).map((d) => ({
    ...d,
    otherPartyId: d.proposer_role === 'PENJUAL' ? d.counterpart_id : d.proposer_id,
  }));
  return assembleLedger(db, annotated, false);
}

// Phone-mode: "other party" is whichever slot does NOT belong to one of this
// phone's own party rows (a phone gets a separate party row per deal it's
// in — see the same note in accountHistory.ts's getAccountHistoryByPhoneHash).
export async function getPhoneLedger(phoneHash: string): Promise<LedgerResult> {
  if (!isLedgerDetailEnabled()) return { status: 'disabled' };
  const db = supabaseServer();
  if (!(await checkLookupRateLimit(db))) return { status: 'error' };
  const { data: parties, error: partiesErr } = await db.from('parties').select('id').eq('phone_hash', phoneHash);
  if (partiesErr) return { status: 'error' };
  if (!parties || parties.length === 0) return { status: 'empty' };
  const partyIds = parties.map((p) => p.id);
  const partyIdSet = new Set(partyIds);

  const cols = 'id, status, tier, proposer_id, counterpart_id, item_desc, amount_idr, rekening_tujuan, rekening_bank, created_at';
  const [proposerDeals, counterpartDeals] = await Promise.all([
    db.from('deals').select(cols).in('proposer_id', partyIds).neq('status', 'DRAF'),
    db.from('deals').select(cols).in('counterpart_id', partyIds).neq('status', 'DRAF'),
  ]);
  if (proposerDeals.error || counterpartDeals.error) return { status: 'error' };

  const dealsById = new Map<string, RawDeal>();
  for (const d of [...(proposerDeals.data ?? []), ...(counterpartDeals.data ?? [])] as RawDeal[]) {
    dealsById.set(d.id, d);
  }

  const annotated: AnnotatedDeal[] = Array.from(dealsById.values()).map((d) => ({
    ...d,
    otherPartyId: partyIdSet.has(d.proposer_id) ? d.counterpart_id : d.proposer_id,
  }));
  // Phone mode: the number can be the payer, so its own payment disputes are a
  // true signal about it and are shown.
  return assembleLedger(db, annotated, true);
}

// Signal 5 — pair-completion rate limit, called from confirmFulfillment (and
// its future pinjam-meminjam equivalent) as a pre-condition guard, not a
// ledger read. No new table: a plain COUNT over `deals` for the pair, same
// shape as app/buat/actions.ts's existing 20/day check, same accepted
// check-then-act TOCTOU caveat (see ROADMAP.md's Tier B entry on that exact
// pattern) — not over-engineered for a circuit breaker.
const PAIR_COMPLETION_LIMIT = 5;
const PAIR_COMPLETION_WINDOW_DAYS = 30;

export async function checkPairCompletionLimit(
  db: SupabaseClient,
  proposerId: string,
  counterpartId: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - PAIR_COMPLETION_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Order-independent pair, as two plain counts summed rather than a single
  // .or()-combined filter — same reasoning as accountHistory.ts's
  // getAccountHistoryByPhoneHash fix this session: sidesteps any question
  // about how the query builder combines filters, instead of betting on it.
  const [asProposer, asCounterpart] = await Promise.all([
    db
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'SELESAI')
      .gte('created_at', windowStart)
      .eq('proposer_id', proposerId)
      .eq('counterpart_id', counterpartId),
    db
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'SELESAI')
      .gte('created_at', windowStart)
      .eq('proposer_id', counterpartId)
      .eq('counterpart_id', proposerId),
  ]);
  if (asProposer.error || asCounterpart.error) return true; // fail open: a query failure must never block a real confirmation
  return (asProposer.count ?? 0) + (asCounterpart.count ?? 0) < PAIR_COMPLETION_LIMIT;
}
