import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

const HASH_PLACEHOLDER = '[diisi otomatis saat publikasi]';
// Body starts at the first numbered section; everything before it (title,
// Versi/Berlaku sejak/Hash dokumen lines, intro paragraph) is metadata
// about the document, not terms, and is excluded from the hash.
const BODY_MARKER = '\n## 1.';

function loadLegalDoc(filename: string) {
  const raw = readFileSync(
    path.join(process.cwd(), 'content/legal', filename),
    'utf-8',
  );
  const bodyStart = raw.indexOf(BODY_MARKER);
  if (bodyStart === -1) {
    throw new Error(`${filename}: could not find body marker "${BODY_MARKER}"`);
  }
  const body = raw.slice(bodyStart + 1);
  const hash = createHash('sha256').update(body).digest('hex');
  return { hash, content: raw.replace(HASH_PLACEHOLDER, hash) };
}

const syarat = loadLegalDoc('syarat-ketentuan.md');
const privasi = loadLegalDoc('privasi-retensi.md');

export const SYARAT_KETENTUAN_HASH = syarat.hash;
export const PRIVASI_RETENSI_HASH = privasi.hash;
export const syaratKetentuanContent = syarat.content;
export const privasiRetensiContent = privasi.content;
