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
  // rekening_* null only while status is DRAF (Pembeli-initiated), or
  // permanently null on a QRIS deal (migration 0036) — the two payment
  // destination types are mutually exclusive, never both populated.
  rekening_tujuan: string | null;
  rekening_bank: string | null;
  payment_method: string;           // 'REKENING' | 'QRIS' (migration 0036)
  qris_nmid: string | null;
  qris_merchant_name: string | null;
  qris_merchant_city: string | null;
  deadline: string;   // ISO-8601 date
  status: string;
  meterai_applied: boolean;
  event: string;      // the event name that triggered this hash
  actor: string;
  payload: unknown;   // event-specific payload (e.g. PERPANJANGAN deadline change)
  prior_hash: string | null;
}

// Recursive: sorts keys at every nesting level, not just the top one.
// `payload` (event-specific, e.g. PERPANJANGAN's {old_deadline, new_deadline}
// or the T&C {tnc_version, tnc_hash}) is itself an object whose key order
// must be canonical too, or two semantically-identical payloads built with
// keys in a different order would hash differently. Codepoint order (plain
// `<`), not localeCompare — a fixed, locale-independent ordering rather than
// one that depends on the running ICU.
//
// SAFETY: every key that enters the canonical form today is ASCII (fixed
// field names — id, token, tnc_version, etc. — never user-supplied text).
// Codepoint `<` and `localeCompare` agree on plain ASCII, so this is safe
// as-is. If a non-ASCII key name is ever added, re-verify that agreement —
// codepoint and locale order can diverge outside ASCII, and diverging would
// make every hash computed before the change unverifiable.
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

/**
 * Compute the SHA-256 hash of a canonical deal state.
 *
 * The canonical form is: stable alphabetical key order at every nesting
 * level, no whitespace, amounts as integers, dates as ISO-8601 strings,
 * prior_hash included in the payload to chain events. This makes the hash
 * chain tamper-evident: altering any prior event changes every subsequent
 * hash.
 */
export function hashDeal(payload: CanonicalDealPayload): string {
  const canonical = JSON.stringify(canonicalize(payload));
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
    rekening_tujuan: string | null;
    rekening_bank: string | null;
    payment_method?: string;
    qris_nmid?: string | null;
    qris_merchant_name?: string | null;
    qris_merchant_city?: string | null;
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
    // Optional + defaulted so every pre-0036 call site (which reads rows that
    // predate these columns, or passes a hand-built object without them)
    // keeps hashing exactly as before rather than changing every deal's
    // chain the instant this ships.
    payment_method: deal.payment_method ?? 'REKENING',
    qris_nmid: deal.qris_nmid ?? null,
    qris_merchant_name: deal.qris_merchant_name ?? null,
    qris_merchant_city: deal.qris_merchant_city ?? null,
    deadline: deal.deadline,               // must already be YYYY-MM-DD
    status: deal.status,
    meterai_applied: deal.meterai_applied,
    event: event.name,
    actor: event.actor,
    payload: event.payload ?? null,
    prior_hash: priorHash,
  };
}
