import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone, phoneHash } from './hash';
import {
  ERROR_TOO_MANY_ATTEMPTS,
  ERROR_PHONE_INVALID,
  ERROR_PHONE_NOT_IN_DEAL,
  ERROR_WRONG_PARTY_PEMBELI_ONLY,
  ERROR_WRONG_PARTY_PENJUAL_ONLY,
} from '@/lib/copy';

export type WhichParty = 'proposer' | 'counterpart';

// ============================================================
// Shared identity-rate limiter — moved here from paymentActions.ts (2026-07-24)
// so assertPartyInDeal can bundle it without a lib→app circular dependency.
// Counts identify_attempts rows in a 15-minute window. The row itself is
// written by identifyPartyByPhone below on a MISS only (§40).
// ============================================================
export async function checkIdentifyRateLimit(
  db: SupabaseClient,
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
  return (attemptCount ?? 0) < ATTEMPT_LIMIT;
}

// ============================================================
// Shared auth guard — bundles the 4-step identity sequence every mutating
// action was hand-rolling separately. One function, 17+ call sites; a new
// action that skips this is a visible omission, not a silent gap.
//
//   1. Rate-limit check   (identify_attempts, 10/15min)
//   2. Normalize phone    (E.164, throws on unparseable)
//   3. identifyPartyByPhone (hash comparison against both parties)
//   4. Optional role gate (PENJUAL-only / PEMBELI-only)
//
// Returns { ok: true, whichParty } or { ok: false, error } with a
// user-facing copy string ready to surface.
// ============================================================
export type AuthResult =
  | { ok: true; whichParty: WhichParty }
  | { ok: false; error: string };

export async function assertPartyInDeal(
  db: SupabaseClient,
  deal: { id: string; proposer_id: string; counterpart_id: string | null; proposer_role: string },
  rawPhone: string,
  options?: { requiredRole?: 'PENJUAL' | 'PEMBELI' },
): Promise<AuthResult> {
  // Step 1 — rate limit
  if (!(await checkIdentifyRateLimit(db, deal.id))) {
    return { ok: false, error: ERROR_TOO_MANY_ATTEMPTS };
  }

  // Step 2 + 3 — normalize + identify. Only catch phone-format errors
  // (normalizePhone throws with "Nomor HP …" messages). DB/network errors
  // must propagate — masking them as "phone invalid" would be a false claim.
  let whichParty: WhichParty | null;
  try {
    whichParty = await identifyPartyByPhone(db, deal, rawPhone);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('Nomor HP')) {
      return { ok: false, error: ERROR_PHONE_INVALID };
    }
    throw err;
  }
  if (!whichParty) return { ok: false, error: ERROR_PHONE_NOT_IN_DEAL };

  // Step 4 — optional role gate
  if (options?.requiredRole) {
    const requiredSlot: WhichParty =
      deal.proposer_role === options.requiredRole ? 'proposer' : 'counterpart';
    if (whichParty !== requiredSlot) {
      return {
        ok: false,
        error:
          options.requiredRole === 'PEMBELI'
            ? ERROR_WRONG_PARTY_PEMBELI_ONLY
            : ERROR_WRONG_PARTY_PENJUAL_ONLY,
      };
    }
  }

  return { ok: true, whichParty };
}

// Phone re-entry is the only identity check in this app — no accounts, no
// sessions (see the comment above the original inline version of this logic
// in app/deal/[token]/actions.ts's acceptDeal). Every post-DISEPAKATI screen
// that needs to know which party is looking at the page re-derives it the
// same way: normalize the entered phone, hash it, compare against both
// parties on the deal. Throws on an unparseable phone — callers already
// try/catch normalizePhone elsewhere in this codebase and are expected to
// keep doing so here.
export async function identifyPartyByPhone(
  db: SupabaseClient,
  deal: { id?: string; proposer_id: string; counterpart_id: string | null },
  rawPhone: string,
): Promise<WhichParty | null> {
  const phoneE164 = normalizePhone(rawPhone);
  const pHash = phoneHash(phoneE164);

  const [{ data: proposerParty }, { data: counterpartParty }] = await Promise.all([
    db.from('parties').select('phone_hash').eq('id', deal.proposer_id).single(),
    deal.counterpart_id
      ? db.from('parties').select('phone_hash').eq('id', deal.counterpart_id).single()
      : Promise.resolve({ data: null }),
  ]);

  if (proposerParty?.phone_hash === pHash) return 'proposer';
  if (counterpartParty?.phone_hash === pHash) return 'counterpart';

  // §40 — record the MISS, here, so all 16 call sites get correct accounting
  // from one place.
  //
  // The identify limiter exists to stop someone holding a deal token from
  // guessing phone numbers against it. It was counting every call instead of
  // every wrong guess, which meant a legitimate party spent the budget just by
  // looking: the buyer's dispute screen alone costs two reads per render
  // (getPaymentDisputeState + getDealStatements), the seller's three. Ten per
  // 15 minutes was gone in three or four page views, after which the party's
  // own bukti read started returning null and their evidence appeared to
  // vanish.
  //
  // Counting misses instead is both safer and looser: a guesser burns the
  // budget on their first few wrong numbers, while someone typing their own
  // number correctly never touches it. Same protection, no collateral damage.
  if (deal.id) {
    const { error } = await db.from('identify_attempts').insert({ deal_id: deal.id });
    if (error) console.error('[identify] failed-attempt insert failed', error.code);
  }
  return null;
}

// Added for the UX-audit fix pass (2026-07-20) — turn-taking WA
// notifications need the *other* (or next-to-act) party's phone_e164 by
// party id. Returns null on a missing id or a lookup miss so call sites can
// treat "no phone to notify" as a no-op rather than an error; sending a
// best-effort WA nudge should never block or fail the transition it's
// attached to.
export async function getPartyPhone(
  db: SupabaseClient,
  partyId: string | null,
): Promise<string | null> {
  if (!partyId) return null;
  const { data } = await db.from('parties').select('phone_e164').eq('id', partyId).single();
  return data?.phone_e164 ?? null;
}
