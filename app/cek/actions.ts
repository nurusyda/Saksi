'use server';

import { createHash } from 'crypto';
import { headers } from 'next/headers';
import { supabaseServer } from '@/lib/supabase/server';
import { getAccountHistory, getAccountHistoryByPhoneHash, maskRekening, maskPhone } from '@/lib/db/accountHistory';
import { normalizePhone, phoneHash } from '@/lib/db/hash';
import { formatAccountHistoryFull } from '@/lib/copy';

// B5 — public /cek lookup. Anti-enumeration is the whole point of this
// file's rate limiter (lookup_attempts, migration 0024): unlike every other
// rate limiter in this app, this one protects the corpus from bulk harvest
// by an anonymous caller, not a specific deal/phone from repeated guesses.
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT = 10;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip, 'utf8').digest('hex');
}

// Vercel sets x-forwarded-for; local dev has neither header, so a lookup in
// dev shares one 'unknown' bucket rather than throwing — acceptable since
// the real target of this limiter is production traffic.
async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : (h.get('x-real-ip') ?? 'unknown');
  return hashIp(ip);
}

async function checkLookupRateLimit(db: ReturnType<typeof supabaseServer>, ipHash: string): Promise<boolean> {
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

export type CekState =
  | { status: 'idle' }
  | { status: 'rate_limited' }
  | { status: 'invalid_input' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'found'; line: string };

export async function lookupAccount(_prev: CekState, formData: FormData): Promise<CekState> {
  const db = supabaseServer();
  const ipHash = await getClientIpHash();
  if (!(await checkLookupRateLimit(db, ipHash))) return { status: 'rate_limited' };

  const mode = formData.get('mode') as string | null;

  if (mode === 'phone') {
    const rawPhone = (formData.get('phone') as string | null)?.trim() ?? '';
    let e164: string;
    try {
      e164 = normalizePhone(rawPhone);
    } catch {
      return { status: 'invalid_input' };
    }

    const result = await getAccountHistoryByPhoneHash(phoneHash(e164));
    if (result.status === 'error') return { status: 'error' };
    if (result.status === 'empty') return { status: 'empty' };

    const line = formatAccountHistoryFull(maskPhone(e164), result.history, result.history.sinceLabel);
    return { status: 'found', line };
  }

  const bank = (formData.get('bank') as string | null)?.trim() ?? '';
  const rekening = (formData.get('rekening') as string | null)?.trim() ?? '';
  if (!bank || !rekening) return { status: 'invalid_input' };

  const result = await getAccountHistory(bank, rekening);
  if (result.status === 'error') return { status: 'error' };
  if (result.status === 'empty') return { status: 'empty' };

  const line = formatAccountHistoryFull(`${bank} ${maskRekening(rekening)}`, result.history, result.history.sinceLabel);
  return { status: 'found', line };
}
