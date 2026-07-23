import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BUKTI_BUCKET = 'bukti';

// Found by monster_check: neither upload path had a server-side size cap,
// only a `size > 0` non-empty check at the call site — an unbounded upload
// could fill the bucket or pressure memory (both functions buffer the whole
// file via arrayBuffer()). Checked against file.size (already-known
// metadata) before that buffering happens, not after, so an oversized file
// is rejected without ever being read into memory. 10 MB comfortably covers
// a phone-camera bank-statement photo or screenshot, the only expected
// content for either upload.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Upload a bukti transfer image to the private storage bucket (migration
 * 0014). Returns the storage path plus the raw bytes/mime type so the
 * caller can also feed the same bytes to the OCR check without a second
 * round-trip to storage.
 */
export async function uploadBuktiImage(
  db: SupabaseClient,
  dealId: string,
  file: File,
): Promise<{ storagePath: string; bytes: Buffer; mimeType: string } | null> {
  if (file.size > MAX_UPLOAD_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${dealId}/${randomUUID()}.${ext}`;
  const mimeType = file.type || 'application/octet-stream';

  const { error } = await db.storage.from(BUKTI_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return null;

  return { storagePath, bytes, mimeType };
}

/**
 * Upload optional hak-jawab supporting evidence (e.g. a bank statement) to
 * the same private bucket as bukti transfer images, under a distinct
 * `hakjawab/` prefix (migration 0014's storage policy has no path
 * restriction, so no new bucket/policy is needed). Unlike bukti, this isn't
 * fed through OCR — it's stored and later shown as a signed URL only.
 */
export async function uploadHakJawabEvidence(
  db: SupabaseClient,
  dealId: string,
  file: File,
): Promise<{ storagePath: string; mimeType: string } | null> {
  if (file.size > MAX_UPLOAD_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `hakjawab/${dealId}/${randomUUID()}.${ext}`;
  const mimeType = file.type || 'application/octet-stream';

  const { error } = await db.storage.from(BUKTI_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return null;

  return { storagePath, mimeType };
}

/**
 * Upload the optional supporting image attached to a FORMAL "barang tidak
 * sesuai" report (migration 0034), under a distinct `report/` prefix. The
 * reporter counterpart to uploadHakJawabEvidence (which stores the responder's
 * evidence). Same private bucket, signed-URL display, no OCR.
 */
export async function uploadReportEvidence(
  db: SupabaseClient,
  dealId: string,
  file: File,
): Promise<{ storagePath: string; mimeType: string } | null> {
  if (file.size > MAX_UPLOAD_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `report/${dealId}/${randomUUID()}.${ext}`;
  const mimeType = file.type || 'application/octet-stream';

  const { error } = await db.storage.from(BUKTI_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return null;

  return { storagePath, mimeType };
}

/**
 * Upload the seller's QRIS image at deal creation (migration 0036), under a
 * distinct `qris/` prefix. Same private bucket/size cap as every other
 * upload here — kept (not discarded after decode) so a later dispute over
 * "this isn't the QRIS you showed me" has the original image as evidence,
 * not just the fields decoded from it.
 */
export async function uploadQrisImage(
  db: SupabaseClient,
  dealId: string,
  file: File,
): Promise<{ storagePath: string; bytes: Buffer; mimeType: string } | null> {
  if (file.size > MAX_UPLOAD_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `qris/${dealId}/${randomUUID()}.${ext}`;
  const mimeType = file.type || 'application/octet-stream';

  const { error } = await db.storage.from(BUKTI_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return null;

  return { storagePath, bytes, mimeType };
}

/**
 * Upload an optional supporting image attached to a deal statement (migration
 * 0033) — the photo a buyer shows with "barang tidak sesuai", or a seller with
 * "dana belum masuk". Same private bucket as bukti, under a distinct
 * `statement/` prefix. Not OCR'd; stored and later shown as a signed URL only,
 * the same tier as uploadHakJawabEvidence.
 */
export async function uploadStatementImage(
  db: SupabaseClient,
  dealId: string,
  file: File,
): Promise<{ storagePath: string } | null> {
  if (file.size > MAX_UPLOAD_BYTES) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `statement/${dealId}/${randomUUID()}.${ext}`;
  const mimeType = file.type || 'application/octet-stream';

  const { error } = await db.storage.from(BUKTI_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) return null;

  return { storagePath };
}
