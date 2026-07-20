import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildCanonicalPayload, hashDeal } from '@/lib/db/hash';
import { DealEventName, DealStatus } from '@/lib/db/transitions';
import type { WhichParty } from '@/lib/db/party';
import { submitAnchor } from '@/lib/db/anchor';
import { sendWaMessage } from '@/lib/wa/send';
import { formatDeadlineNudgeMessage } from '@/lib/copy';
import { getTodayWib } from '@/lib/format';

// Phase 6 deadline sweep — one unified cron entry, two branches. Decision
// tree confirmed 2026-07-20, corrected same day after review (an earlier
// version had a third branch firing TENGGAT_LEWAT on a timer for
// DIKONFIRMASI_TERIMA — wrong; see migration 0018's header comment for the
// full reasoning, verified against content/legal/syarat-ketentuan.md §4.1).
// TENGGAT_LEWAT is never sweep-driven, for either state — only an actual
// filed report (Section C6, not yet built) can fire it.
//
// Per-candidate races are handled by skip-and-log, not retry: a lost race
// (RPC returns 0 rows) means the deal's state already changed since
// candidate selection, so it's simply no longer eligible — unlike
// user-facing actions, there's no user waiting on this specific attempt to
// succeed right now; the next daily run picks up whatever's still eligible.

type DealRow = {
  id: string;
  token: string;
  tier: string;
  proposer_id: string;
  counterpart_id: string | null;
  proposer_role: string;
  item_desc: string;
  amount_idr: number;
  rekening_tujuan: string | null;
  rekening_bank: string | null;
  deadline: string;
  status: string;
  meterai_applied: boolean;
};

async function getLastHash(db: ReturnType<typeof supabaseServer>, dealId: string): Promise<string | null> {
  const { data, error } = await db
    .from('deal_events')
    .select('new_hash')
    .eq('deal_id', dealId)
    .order('id', { ascending: false })
    .limit(1)
    .single();
  // Same data?.new_hash ?? null pattern used at 5 other call sites across
  // actions.ts/paymentActions.ts — not changed here, to stay consistent.
  // The one addition: a background job has no other feedback mechanism, so
  // a real query failure (vs. the benign "no prior events" case) is worth
  // logging here specifically, unlike the user-facing call sites where a
  // failure surfaces to the user through the action's own error path.
  if (error && error.code !== 'PGRST116') {
    console.error('[deadline-sweep] getLastHash query failed', dealId, error);
  }
  return data?.new_hash ?? null;
}

// Jual-beli only (the only functional deal type — Section B gating). Which
// slot (proposer/counterpart) the nudge targets depends on which state the
// deal is in — opposite directions, matching exactly which party the
// corresponding confirm action already restricts to in paymentActions.ts:
//   - DIBAYAR_DIKLAIM: payeeSlot (Penjual) — same slot confirmReceipt uses.
//   - DIKONFIRMASI_TERIMA: payerSlot (Pembeli) — same slot confirmFulfillment uses.
// Does NOT generalize to pinjam-meminjam/sewa-menyewa without further design
// work (those deal types are gated off entirely right now — createDeal
// rejects any proposer_role besides PENJUAL/PEMBELI). Specifically unresolved
// for pinjam-meminjam: copy-id.md §14's "Konfirmasi uang sudah dikembalikan"
// fulfillment label appears to overlap with what RECEIPT_CONFIRMED already
// represents in the current single-leg (repayment-only) schema — flagged,
// not designed, pending a real design pass on pinjam-meminjam itself.
function nudgeTargetSlot(deal: DealRow): WhichParty | null {
  if (deal.status === DealStatus.DIBAYAR_DIKLAIM) {
    return deal.proposer_role === 'PENJUAL' ? 'proposer' : 'counterpart';
  }
  if (deal.status === DealStatus.DIKONFIRMASI_TERIMA) {
    return deal.proposer_role === 'PEMBELI' ? 'proposer' : 'counterpart';
  }
  return null;
}

async function runNudgeBranch(db: ReturnType<typeof supabaseServer>, todayWib: string): Promise<number> {
  const { data: candidates } = await db.rpc('get_nudge_candidates', { p_today_wib: todayWib });
  let count = 0;

  for (const deal of (candidates ?? []) as DealRow[]) {
    const targetSlot = nudgeTargetSlot(deal);
    if (!targetSlot) continue; // not jual-beli-shaped roles, or unexpected status; skip

    const priorHash = await getLastHash(db, deal.id);
    const canonical = buildCanonicalPayload(
      deal,
      { name: DealEventName.NUDGE_SENT, actor: 'SYSTEM', payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error } = await db
      .rpc('sweep_nudge_with_event', { p_deal_id: deal.id, p_prior_hash: priorHash, p_new_hash: newHash })
      .maybeSingle();

    if (error) {
      console.error('[deadline-sweep] sweep_nudge_with_event failed', deal.id, error);
      continue;
    }
    if (!rpcRow) continue; // lost race or already nudged; skip

    void submitAnchor(newHash);

    const targetPartyId = targetSlot === 'proposer' ? deal.proposer_id : deal.counterpart_id;
    if (targetPartyId) {
      const { data: targetParty } = await db.from('parties').select('phone_e164').eq('id', targetPartyId).single();
      if (targetParty?.phone_e164) {
        const dealUrl = `https://saksi.app/deal/${deal.token}`;
        const message = formatDeadlineNudgeMessage(deal.item_desc, dealUrl);
        try {
          // Awaited sequentially, not fire-and-forget: the current stub
          // resolves immediately, but a real WA client that hangs on one
          // candidate will stall every later candidate in this loop until
          // it resolves or times out — separate from the try/catch below,
          // which only covers what happens once it settles. Worth revisiting
          // (a short timeout, or moving off the await path) when a real
          // client replaces this stub.
          await sendWaMessage({ toPhoneE164: targetParty.phone_e164, template: 'DEADLINE_NUDGE', params: { message } });
        } catch (err) {
          // Current stub never throws, but a real WA client will — the
          // NUDGE_SENT event is already committed at this point, so a
          // delivery failure shouldn't abort the rest of the sweep run.
          console.error('[deadline-sweep] WA send failed', deal.id, err);
        }
      }
    }

    count++;
  }

  return count;
}

async function runKedaluwarsaBranch(db: ReturnType<typeof supabaseServer>, todayWib: string): Promise<number> {
  const { data: candidates } = await db.rpc('get_kedaluwarsa_candidates', { p_today_wib: todayWib });
  let count = 0;

  for (const deal of (candidates ?? []) as DealRow[]) {
    const priorHash = await getLastHash(db, deal.id);
    const virtualDeal = { ...deal, status: DealStatus.KEDALUWARSA };
    const canonical = buildCanonicalPayload(
      virtualDeal,
      { name: DealEventName.KEDALUWARSA_LAPSED, actor: 'SYSTEM', payload: null },
      priorHash,
    );
    const newHash = hashDeal(canonical);

    const { data: rpcRow, error } = await db
      .rpc('sweep_kedaluwarsa_with_event', { p_deal_id: deal.id, p_prior_hash: priorHash, p_new_hash: newHash })
      .maybeSingle();

    if (error) {
      console.error('[deadline-sweep] sweep_kedaluwarsa_with_event failed', deal.id, error);
      continue;
    }
    if (!rpcRow) continue;

    void submitAnchor(newHash);
    count++;
  }

  return count;
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = supabaseServer();
  // Computed once per invocation, passed explicitly to both candidate
  // queries — found by monster_check: Postgres's current_date resolves in
  // the session's timezone (UTC by default on Supabase), but deals.deadline
  // is entered and validated as a WIB calendar date. See migration 0018.
  const todayWib = getTodayWib();

  // Sequential, not Promise.all, AND kedaluwarsa runs first — both found by
  // monster_check, two rounds apart. Sequential alone stops the two RPCs
  // from racing on the same deal (a 35-day-overdue deal with no prior nudge
  // matches both candidate queries, since both check status IN
  // (DIBAYAR_DIKLAIM, DIKONFIRMASI_TERIMA), true before either branch runs).
  // But sequential-with-nudge-first still let that same deal get nudged
  // ("please act") immediately before being closed out as KEDALUWARSA in
  // the same run — a contradictory notification for a deal the sweep was
  // about to terminate anyway. Running kedaluwarsa first closes that gap:
  // once its status flips to KEDALUWARSA, it no longer matches the nudge
  // candidate query's status filter, so it's correctly skipped.
  const kedaluwarsa = await runKedaluwarsaBranch(db, todayWib);
  const nudged = await runNudgeBranch(db, todayWib);

  return NextResponse.json({ nudged, kedaluwarsa });
}
