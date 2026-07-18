// OpenTimestamps anchor layer.
//
// OTS provides external, Bitcoin-backed timestamp proofs for every deal event hash.
// It is NEVER in the critical path: user flows complete as soon as the hash is stored
// in deal_events.new_hash. OTS is async background evidence.
//
// TODO: wire up the opentimestamps npm package once a safe version (no request/
// request-promise/tough-cookie@2 transitive deps) is available. The SHA-256 hash
// chain in Postgres is the operational integrity guarantee in the meantime.

/**
 * Submit a SHA-256 hex hash to the OTS calendars.
 * Returns the pending .ots proof blob, or null when OTS is not yet wired.
 * Call fire-and-forget after inserting the deal_event row.
 */
export async function submitAnchor(sha256Hex: string): Promise<Buffer | null> {
  // TODO: replace stub with opentimestamps client once dep is safe
  console.log(`[anchor] TODO: stamp hash ${sha256Hex}`);
  return null;
}

/**
 * Attempt to upgrade a pending OTS proof to a Bitcoin-confirmed proof.
 * Returns the upgraded Buffer on success, or null when not yet confirmed / not wired.
 */
export async function upgradeProof(pendingOtsBlob: Buffer): Promise<Buffer | null> {
  // TODO: replace stub with opentimestamps client once dep is safe
  console.log(`[anchor] TODO: upgrade proof (${pendingOtsBlob.length} bytes)`);
  return null;
}

/**
 * Human-readable anchor status for display in the UI.
 * Returns the correct label; never says "terverifikasi" or "asli".
 */
export function anchorStatusLabel(otsProof: Buffer | null, upgraded: boolean): string {
  if (!otsProof) return 'Belum dijangkar';
  if (!upgraded) return 'Dijangkar, menunggu konfirmasi Bitcoin';
  return 'Dijangkar di blockchain Bitcoin';
}
