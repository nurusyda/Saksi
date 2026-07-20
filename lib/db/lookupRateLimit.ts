// Shared anti-enumeration rate limiter — extracted from app/cek/actions.ts
// (build step 4, migration 0024) so the ledger fetch functions
// (lib/db/ledger.ts's getRekeningLedger/getPhoneLedger) share the exact same
// ip_hash-keyed budget as the base /cek lookup, rather than each anonymous,
// no-deal-context corpus-read surface inventing its own counter. Unlike
// every other rate limiter in this app (which protects a specific
// deal/phone from repeated guesses), this one protects the corpus itself
// from bulk harvest by an anonymous caller with no deal token and no phone
// in hand — the ledger is exactly that same threat category, just reading
// more per call.

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT = 10;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip, 'utf8').digest('hex');
}

// Vercel sets x-forwarded-for; local dev has neither header, so a lookup in
// dev shares one 'unknown' bucket rather than throwing — acceptable since
// the real target of this limiter is production traffic.
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (h.get('x-real-ip') ?? 'unknown');
  return hashIp(ip);
}

export async function checkLookupRateLimit(db: SupabaseClient): Promise<boolean> {
  const ipHash = await getClientIpHash();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await db
    .from('lookup_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('attempted_at', windowStart);
  // Same accepted check-then-act race as identify_attempts/accept_attempts
  // (documented there) — small blast radius at this threshold.
  if ((count ?? 0) >= RATE_LIMIT) return false;
  await db.from('lookup_attempts').insert({ ip_hash: ipHash });
  return true;
}
