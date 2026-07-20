'use server';

import { supabaseServer } from '@/lib/supabase/server';
import { getAccountHistory, getAccountHistoryByPhoneHash, maskRekening, maskPhone } from '@/lib/db/accountHistory';
import { getRekeningLedger, getPhoneLedger, isLedgerDetailEnabled, type LedgerResult } from '@/lib/db/ledger';
import { checkLookupRateLimit } from '@/lib/db/lookupRateLimit';
import { normalizePhone, phoneHash } from '@/lib/db/hash';
import { formatAccountHistoryFull } from '@/lib/copy';

export type CekState =
  | { status: 'idle' }
  | { status: 'rate_limited' }
  | { status: 'invalid_input' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'found'; line: string; ledgerEnabled: boolean };

export async function lookupAccount(_prev: CekState, formData: FormData): Promise<CekState> {
  const db = supabaseServer();
  if (!(await checkLookupRateLimit(db))) return { status: 'rate_limited' };

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
    return { status: 'found', line, ledgerEnabled: isLedgerDetailEnabled() };
  }

  const bank = (formData.get('bank') as string | null)?.trim() ?? '';
  const rekening = (formData.get('rekening') as string | null)?.trim() ?? '';
  if (!bank || !rekening) return { status: 'invalid_input' };

  const result = await getAccountHistory(bank, rekening);
  if (result.status === 'error') return { status: 'error' };
  if (result.status === 'empty') return { status: 'empty' };

  const line = formatAccountHistoryFull(`${bank} ${maskRekening(rekening)}`, result.history, result.history.sinceLabel);
  return { status: 'found', line, ledgerEnabled: isLedgerDetailEnabled() };
}

// B6/ledger design pass. Rekening-mode: client already holds bank+rekening
// locally (its own form fields). Phone-mode: client only ever holds the raw
// phone it typed (never a hash — CekState above never returns one), so this
// re-normalizes+hashes server-side, same boundary lookupAccount itself
// already uses, rather than ever handing a hash to the client to round-trip.
export async function getRekeningLedgerAction(bank: string, rekening: string): Promise<LedgerResult> {
  return getRekeningLedger(bank, rekening);
}

export async function getPhoneLedgerAction(rawPhone: string): Promise<LedgerResult> {
  let e164: string;
  try {
    e164 = normalizePhone(rawPhone);
  } catch {
    return { status: 'error' };
  }
  return getPhoneLedger(phoneHash(e164));
}
