import { cookies } from 'next/headers';
import type { WhichParty } from './party';

// Convenience only, not a trust boundary: this app still has no accounts or
// login (see identifyPartyByPhone's header comment in party.ts). Every
// mutating action a skipped IdentifyPartyGate leads to
// (submitBukti/confirmReceipt/confirmFulfillment) independently re-derives
// whichParty from the phone against the DB before doing anything — this
// cookie only ever decides which read-only view to render first. A forged
// or stale value can route the UI to the wrong waiting-vs-active view; it
// can never get a phone accepted that identifyPartyByPhone wouldn't accept
// on its own. When it expires or was never set, the phone form (still the
// only real identity check) is exactly what renders — same as today.
//
// Deliberately carries ONLY whichParty, never the phone (monster_check
// BLOCKER, fixed 2026-07-20): whichParty is a non-PII role label, safe to
// flow server -> client as a prop. The phone itself must never cross that
// boundary again in either direction — the httpOnly cookie is fine holding
// it (never JS-readable, never serialized into a render), but page.tsx must
// not read it back out and hand it to a client component as a prop, since
// Next.js serializes RSC props into the payload sent to the browser (Law 2:
// raw PII in a client bundle/API response is an unconditional BLOCKER, no
// carve-out for "it's the same user's own number"). The phone value the
// skip path needs for binding follow-up actions is sourced instead from
// usePersistedPhone() (client-side sessionStorage, already populated by the
// accept/identify form the user just filled in) — see IdentifyPartyGate.
const SESSION_MAX_AGE_SECONDS = 45 * 60;

function sessionCookieName(token: string): string {
  return `saksi_party_${token}`;
}

export async function setPartySession(token: string, whichParty: WhichParty): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(token), whichParty, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: `/deal/${token}`,
    sameSite: 'lax',
    secure: true,
    httpOnly: true,
  });
}

export async function getPartySession(token: string): Promise<WhichParty | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(sessionCookieName(token))?.value;
  if (raw !== 'proposer' && raw !== 'counterpart') return null;
  return raw;
}
