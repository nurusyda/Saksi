import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone, phoneHash } from './hash';

export type WhichParty = 'proposer' | 'counterpart';

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
  deal: { proposer_id: string; counterpart_id: string | null },
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
  return null;
}
