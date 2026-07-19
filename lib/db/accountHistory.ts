// Shared account-history lookup — used by the ungated informational check on
// the create-deal form (Phase 0.5) and, later, the real gated forced-check
// page (Phase 3). Server-only: queries the raw `deals` table directly (its
// unmasked rekening_tujuan). anon/authenticated no longer have table-level
// SELECT on `deals` at all (closed in migration 0009 — public reads must go
// through the masked `deals_public` view), but this function still only ever
// runs behind the service-role client. Never call this from a client
// component; only from a Server Action.
//
// Matches on bank + rekening_tujuan together, not rekening_tujuan alone —
// each bank keeps its own independent account numbering, so two different
// banks can have accounts sharing the same number. Dropping bank from the
// match would risk attributing one account's history to an unrelated account
// at a different bank.

import { supabaseServer } from '@/lib/supabase/server';

export interface AccountHistory {
  selesaiCount: number;
  tidakDipenuhiCount: number;
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

export async function getAccountHistory(
  bank: string,
  rekening: string,
): Promise<AccountHistoryResult> {
  const db = supabaseServer();
  const { data, error } = await db
    .from('deals')
    .select('status, created_at')
    .eq('rekening_bank', bank)
    .eq('rekening_tujuan', rekening)
    .neq('status', 'DRAF');

  if (error) return { status: 'error' };
  if (!data || data.length === 0) return { status: 'empty' };

  const selesaiCount = data.filter((d) => d.status === 'SELESAI').length;
  const tidakDipenuhiCount = data.filter((d) => d.status === 'TIDAK_DIPENUHI').length;
  const earliest = data.reduce(
    (min, d) => (d.created_at < min ? d.created_at : min),
    data[0].created_at,
  );
  const sinceLabel = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(earliest));

  return { status: 'found', history: { selesaiCount, tidakDipenuhiCount, sinceLabel } };
}
