import { createHash } from 'crypto';

// Shape of the data included in the canonical hash.
// Amounts are always integers (bigint → number here; caller must not pass floats).
// Dates are ISO-8601 strings (YYYY-MM-DD).
export interface CanonicalDealPayload {
  id: string;
  token: string;
  tier: string;
  proposer_id: string;
  counterpart_id: string | null;
  proposer_role: string;
  item_desc: string;
  amount_idr: number;
  rekening_tujuan: string;
  rekening_bank: string;
  deadline: string;   // ISO-8601 date
  status: string;
  meterai_applied: boolean;
  event: string;      // the event name that triggered this hash
  actor: string;
  payload: unknown;   // event-specific payload (e.g. PERPANJANGAN deadline change)
  prior_hash: string | null;
}

function sortedKeys<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  ) as T;
}

/**
 * Compute the SHA-256 hash of a canonical deal state.
 *
 * The canonical form is: stable alphabetical key order, no whitespace,
 * amounts as integers, dates as ISO-8601 strings, prior_hash included in
 * the payload to chain events. This makes the hash chain tamper-evident:
 * altering any prior event changes every subsequent hash.
 */
export function hashDeal(payload: CanonicalDealPayload): string {
  const canonical = JSON.stringify(sortedKeys(payload));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Normalize a raw Indonesian phone input to E.164 (+628xx...).
 * Accepts: 08xx, 628xx, +628xx. Throws on unrecognizable format.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let e164: string;
  if (digits.startsWith('0')) {
    e164 = '+62' + digits.slice(1);
  } else if (digits.startsWith('62')) {
    e164 = '+' + digits;
  } else {
    throw new Error(`Nomor HP tidak dikenali: ${raw}`);
  }
  if (!/^\+628\d{7,11}$/.test(e164)) {
    throw new Error(`Nomor HP tidak valid: ${raw}`);
  }
  return e164;
}

/** SHA-256 of E.164 phone string — the public clustering key. */
export function phoneHash(phoneE164: string): string {
  return createHash('sha256').update(phoneE164, 'utf8').digest('hex');
}

/**
 * Build the CanonicalDealPayload from a deal row + the triggering event.
 * Caller is responsible for supplying prior_hash from the previous deal_event row.
 */
export function buildCanonicalPayload(
  deal: {
    id: string;
    token: string;
    tier: string;
    proposer_id: string;
    counterpart_id: string | null;
    proposer_role: string;
    item_desc: string;
    amount_idr: number | bigint;
    rekening_tujuan: string;
    rekening_bank: string;
    deadline: string;
    status: string;
    meterai_applied: boolean;
  },
  event: { name: string; actor: string; payload: unknown },
  priorHash: string | null
): CanonicalDealPayload {
  return {
    id: deal.id,
    token: deal.token,
    tier: deal.tier,
    proposer_id: deal.proposer_id,
    counterpart_id: deal.counterpart_id,
    proposer_role: deal.proposer_role,
    item_desc: deal.item_desc,
    amount_idr: Number(deal.amount_idr),   // ensure integer, not bigint
    rekening_tujuan: deal.rekening_tujuan,
    rekening_bank: deal.rekening_bank,
    deadline: deal.deadline,               // must already be YYYY-MM-DD
    status: deal.status,
    meterai_applied: deal.meterai_applied,
    event: event.name,
    actor: event.actor,
    payload: event.payload ?? null,
    prior_hash: priorHash,
  };
}
