import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const BUKTI_BUCKET = 'bukti';

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
