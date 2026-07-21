// OpenTimestamps anchor layer.
//
// External, third-party-attested timestamp proofs for every deal event hash,
// on top of the SHA-256 hash chain in Postgres. The chain is the OPERATIONAL
// integrity guarantee — any alteration breaks it, and it is verified end to
// end in the app's own tests. OTS adds *independent* attestation (calendar
// servers, ultimately Bitcoin) that a given hash existed at a given time, so
// the record's integrity does not rest on SAKSI's own database alone. It is
// NEVER in the critical path: user flows complete the instant the hash is
// written to deal_events.new_hash; this runs fire-and-forget after.
//
// ── Why hand-rolled, no dependency (§44, 2026-07-21) ──────────────────────
// Both maintained JS OTS libraries (`opentimestamps`, `javascript-open
// timestamps`) pull `bitcore-lib` plus the deprecated `request` /
// `request-promise` chain, which carries the tough-cookie prototype-pollution
// advisory. Adding a package with a known CVE to a product whose entire
// thesis is integrity is the wrong trade, so this speaks the calendar HTTP
// protocol directly and builds the .ots bytes by hand. The format is small
// and documented: a DetachedTimestampFile is
//   magic(31) ‖ version(0x01) ‖ sha256-op(0x08) ‖ digest(32) ‖ <calendar ts>
// and a calendar's POST /digest returns exactly the <calendar ts> tail for
// the submitted digest.
//
// ── Gated OFF until externally verified (important) ───────────────────────
// This is wired but disabled by default (OTS_ANCHORING_ENABLED). Two reasons,
// both honest:
//   1. It was written in an environment that cannot reach the calendar
//      servers, so the produced .ots bytes were never checked against the
//      real `ots verify` tooling. Shipping an unverified crypto artifact as
//      "anchored" would be exactly the overclaim SAKSI forbids.
//   2. The acceptance test is concrete: flip the flag on a staging deal,
//      download the proof via /api/ots/<new_hash>, run `ots verify proof.ots`
//      with the reference client. Only once that passes does the flag flip in
//      production, and only then does anchorStatusLabel ever move off "Belum
//      dijangkar".
// Default-off means live behaviour is unchanged — no proof stored, status
// stays "belum dijangkar" — until that test passes. The claim never runs
// ahead of the proof.

import { supabaseServer } from '@/lib/supabase/server';

// DetachedTimestampFile magic + major version + the SHA-256 crypto-op tag.
const OTS_MAGIC = Buffer.from([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
  0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
  0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const OTS_VERSION = 0x01;
const OP_SHA256 = 0x08;

// Public calendars, tried in order; the first that answers is used. A single
// calendar's timestamp is a valid, verifiable proof — multi-calendar merging
// is a redundancy nicety that needs real Timestamp-tree parsing and is
// deliberately skipped here.
const CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://alice.btc.calendar.opentimestamps.org',
];

function isEnabled(): boolean {
  return process.env.OTS_ANCHORING_ENABLED === 'true';
}

async function submitToCalendar(digest: Buffer, calendar: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`${calendar}/digest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/vnd.opentimestamps.v1',
        'User-Agent': 'saksi-ots/0.1',
      },
      body: new Uint8Array(digest),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[anchor] calendar ${calendar} returned ${res.status}`);
      return null;
    }
    const body = Buffer.from(await res.arrayBuffer());
    return body.length > 0 ? body : null;
  } catch (err) {
    console.error(`[anchor] calendar ${calendar} failed: ${err instanceof Error ? err.message : 'unknown'}`);
    return null;
  }
}

/**
 * Submit a SHA-256 hex hash to the OTS calendars and persist the resulting
 * .ots proof onto the matching deal_events row (by new_hash).
 *
 * Returns the .ots proof bytes on success, or null when anchoring is disabled
 * or every calendar failed. Called fire-and-forget after inserting the event.
 */
export async function submitAnchor(sha256Hex: string): Promise<Buffer | null> {
  if (!isEnabled()) return null; // no-op until the acceptance test passes

  const digest = Buffer.from(sha256Hex, 'hex');
  if (digest.length !== 32) {
    console.error('[anchor] refusing to anchor a non-32-byte digest');
    return null;
  }

  let calendarTs: Buffer | null = null;
  for (const cal of CALENDARS) {
    calendarTs = await submitToCalendar(digest, cal);
    if (calendarTs) break;
  }
  if (!calendarTs) return null;

  const ots = Buffer.concat([
    OTS_MAGIC,
    Buffer.from([OTS_VERSION, OP_SHA256]),
    digest,
    calendarTs,
  ]);

  // Persist onto the event whose new_hash we just anchored. Never blocks the
  // caller (fire-and-forget), so a write failure is logged, not thrown.
  try {
    const db = supabaseServer();
    const { error } = await db.from('deal_events').update({ ots_proof: ots }).eq('new_hash', sha256Hex);
    if (error) console.error(`[anchor] proof persist failed: ${error.code}`);
  } catch (err) {
    console.error(`[anchor] proof persist threw: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  return ots;
}

/**
 * Upgrade a pending calendar proof to a Bitcoin-confirmed one.
 *
 * Honestly partial: turning a pending attestation into a Bitcoin attestation
 * means polling the calendar's /timestamp endpoint and re-serializing the
 * Timestamp tree, which needs the parser this module deliberately does not
 * hand-roll. Left as an explicit no-op rather than a fake success — the
 * pending proof stored by submitAnchor is already externally verifiable and
 * upgradeable by the reference `ots upgrade` tool in the meantime.
 */
export async function upgradeProof(pendingOtsBlob: Buffer): Promise<Buffer | null> {
  void pendingOtsBlob;
  return null;
}

/**
 * Human-readable anchor status for display. Never says "terverifikasi" or
 * "asli"; states only what the proof attests.
 */
export function anchorStatusLabel(otsProof: Buffer | null, upgraded: boolean): string {
  if (!otsProof) return 'Belum dijangkar';
  if (!upgraded) return 'Dijangkar ke kalender OpenTimestamps, menunggu konfirmasi Bitcoin';
  return 'Dijangkar di blockchain Bitcoin';
}
