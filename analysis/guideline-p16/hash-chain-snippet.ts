// SAKSI Hash Chain — 18-line core. Zero dependencies beyond Node.js crypto.
// Called at every deal_events INSERT. Tampering with any past event
// changes every subsequent hash, making the chain tamper-evident.
import { createHash } from 'crypto';

/** Deterministic key ordering — {b:1,a:2} and {a:2,b:1} hash identically. */
function sortedKeys<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  ) as T;
}

/** SHA-256 over a canonical JSON payload with sorted keys. */
export function hashDeal(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(sortedKeys(payload));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// Invariant: deal_events[i].prior_hash === deal_events[i-1].new_hash
//           deal_events[i].new_hash   === hashDeal(canonical(deal, event_i))
