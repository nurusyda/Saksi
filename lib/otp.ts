import { randomInt, createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWaMessage } from './wa/send';
import { formatOtpMessage } from './copy';

// OTP send/verify for breach-report filing (build step 4). Scoped to that
// one call site — see migration 0020's header comment for why this isn't a
// generic multi-purpose module yet.

const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 5;
const SEND_RATE_LIMIT_WINDOW_MINUTES = 60;
const SEND_RATE_LIMIT = 3;
const VERIFY_ATTEMPT_LIMIT = 5;

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, '0');
}

function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

export type SendOtpResult = { sent: boolean; rateLimited?: boolean };

/**
 * Send a fresh OTP code to phoneE164 for this deal. Rate-limited to
 * SEND_RATE_LIMIT sends per phone per rolling hour (integrations.md §2).
 * Never throws — WA send failures are logged by sendWaMessage itself and
 * surface here as { sent: false }.
 */
export async function sendOtp(
  db: SupabaseClient,
  dealId: string,
  phoneE164: string,
): Promise<SendOtpResult> {
  const windowStart = new Date(Date.now() - SEND_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await db
    .from('otp_send_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('phone_e164', phoneE164)
    .gte('attempted_at', windowStart);
  if ((count ?? 0) >= SEND_RATE_LIMIT) return { sent: false, rateLimited: true };

  await db.from('otp_send_attempts').insert({ phone_e164: phoneE164 });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { error: insertErr } = await db.from('otp_codes').insert({
    deal_id: dealId,
    phone_e164: phoneE164,
    code_hash: hashCode(code),
    expires_at: expiresAt,
  });
  if (insertErr) return { sent: false };

  const { sent } = await sendWaMessage({
    toPhoneE164: phoneE164,
    template: 'OTP_BREACH_REPORT',
    params: { message: formatOtpMessage(code) },
  });
  return { sent };
}

export type VerifyOtpResult = { verified: boolean; error?: 'invalid' | 'too_many_attempts' };

/**
 * Verify a code against the most recent unconsumed OTP row for this
 * phone+deal. Increments the row's attempt count on every call (even a
 * correct one, for symmetry with the limit check) and marks it verified on
 * success — verified_at is what fileBarangTidakSesuaiReport later checks
 * and consumes, not this function's return value alone.
 */
export async function verifyOtp(
  db: SupabaseClient,
  dealId: string,
  phoneE164: string,
  code: string,
): Promise<VerifyOtpResult> {
  const { data: row } = await db
    .from('otp_codes')
    .select('*')
    .eq('deal_id', dealId)
    .eq('phone_e164', phoneE164)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { verified: false, error: 'invalid' };
  if (row.attempts >= VERIFY_ATTEMPT_LIMIT) return { verified: false, error: 'too_many_attempts' };

  // Bug found by monster_check: a plain read-then-write increment without a
  // guard on the row's current value lets two concurrent verify calls both
  // read the same attempts count and both write the same next value,
  // effectively granting an extra attempt. The `.eq('attempts', row.attempts)`
  // guard makes this an optimistic-concurrency check (same idea as every
  // prior_hash recheck elsewhere in this app) — a losing concurrent call's
  // UPDATE matches 0 rows instead of double-counting. Chaining .select()
  // returns the row this exact UPDATE touched (one round trip, not two); if
  // it lost the race (0 rows updated), `updated` is null and the fallback
  // `row.attempts + 1` still reflects "at least one increment landed" —
  // simpler than a separate re-select and never under-counts by more than
  // one concurrent caller would.
  const { data: updated } = await db
    .from('otp_codes')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id)
    .eq('attempts', row.attempts)
    .select('attempts')
    .maybeSingle();

  // Bug found by monster_check: without this check, a losing concurrent
  // call would fall through to the hash comparison without ever seeing that
  // the limit was actually reached — effectively spending an unrecorded 6th
  // attempt.
  if ((updated?.attempts ?? row.attempts + 1) >= VERIFY_ATTEMPT_LIMIT) {
    return { verified: false, error: 'too_many_attempts' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) return { verified: false, error: 'invalid' };
  if (row.code_hash !== hashCode(code)) return { verified: false, error: 'invalid' };

  await db.from('otp_codes').update({ verified_at: new Date().toISOString() }).eq('id', row.id);
  return { verified: true };
}

const VERIFIED_WINDOW_MINUTES = 15;

/**
 * Has phoneE164 completed OTP verification for this deal recently, without
 * having already consumed it on a prior report? Called by
 * fileBarangTidakSesuaiReport right before filing — never trusts a
 * client-supplied "I verified" flag, same posture as identifyPartyByPhone
 * re-deriving whichParty from the phone on every mutating action.
 */
export async function consumeVerifiedOtp(
  db: SupabaseClient,
  dealId: string,
  phoneE164: string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - VERIFIED_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data: row } = await db
    .from('otp_codes')
    .select('id, verified_at')
    .eq('deal_id', dealId)
    .eq('phone_e164', phoneE164)
    .is('consumed_at', null)
    .not('verified_at', 'is', null)
    .gte('verified_at', windowStart)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return false;

  // Bug found by monster_check: checking only `!error` returns true even
  // when the UPDATE matched 0 rows (e.g. a concurrent call already consumed
  // this same row between the select above and this update) — Postgres/
  // PostgREST doesn't error on a WHERE clause matching nothing, it just
  // affects nothing. Chaining .select() forces PostgREST to return exactly
  // the rows this UPDATE actually touched (a real RETURNING, not a second
  // read), so an empty result here means someone else already consumed it.
  const { data, error } = await db
    .from('otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('consumed_at', null)
    .select('id');
  return !error && !!data && data.length > 0;
}
