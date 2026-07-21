'use server';

import { supabaseServer } from '@/lib/supabase/server';
import { checkLookupRateLimit } from '@/lib/db/lookupRateLimit';

// ============================================================
// getMyDealsSummary — refresh the seller's device-local tagihan list.
//
// The caller supplies deal tokens their own browser recorded (see
// lib/sellerDeals.ts). This returns only fields the deal page already shows
// to anyone holding the same token — item, amount, status, deadline — so it
// discloses nothing that possession of the token did not already grant. The
// full rekening, both parties' phones, and the bukti are all excluded, as
// they are everywhere outside the party-gated actions.
//
// Tokens are nanoid(21), so they are not guessable; the risk this guards is
// bulk submission of harvested tokens, not enumeration. Two limits for that:
// the shared ip_hash lookup budget (same one /cek and the ledger reads use,
// since this is the same "anonymous caller reading the corpus" category),
// and a hard cap on tokens per call so one request cannot drain the corpus.
//
// Deliberately NOT keyed on a phone number. A phone-keyed "my deals" would
// hand out capabilities to whoever typed a number — see lib/sellerDeals.ts's
// header for the full reasoning.
// ============================================================

const MAX_TOKENS_PER_CALL = 100;

export interface DealSummary {
  token: string;
  itemDesc: string;
  amountIdr: number;
  status: string;
  deadline: string;
  createdAt: string;
}

export async function getMyDealsSummary(tokens: string[]): Promise<DealSummary[] | 'rate_limited'> {
  if (tokens.length === 0) return [];

  const db = supabaseServer();
  if (!(await checkLookupRateLimit(db))) return 'rate_limited';

  const wanted = tokens.slice(0, MAX_TOKENS_PER_CALL);

  // `deals`, not `deals_public`, despite the view being the safer default
  // everywhere else: deals_public has `where status != 'DRAF'`, and a DRAF
  // tagihan — created, link sent, buyer has not opened it yet — is precisely
  // the one a seller most needs to find again. Excluding it would leave the
  // lost-link problem unsolved for the case it bites hardest.
  //
  // The explicit select list is therefore the security boundary here. It must
  // never grow to include rekening_tujuan (the full account number) or any
  // party id; if this surface ever needs more than these six columns, add a
  // view with the right shape rather than widening this select.
  const { data } = await db
    .from('deals')
    .select('token, item_desc, amount_idr, status, deadline, created_at')
    .in('token', wanted);

  return (data ?? []).map((d) => ({
    token: d.token as string,
    itemDesc: d.item_desc as string,
    amountIdr: Number(d.amount_idr),
    status: d.status as string,
    deadline: d.deadline as string,
    createdAt: d.created_at as string,
  }));
}
