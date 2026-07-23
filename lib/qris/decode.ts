import sharp from 'sharp';
import jsQR from 'jsqr';

// QRIS is a QR code encoding an EMVCo "Merchant Presented Mode" payload — a
// flat tag-length-value (TLV) text string with a CRC16 checksum, not a photo
// needing OCR. Decoding is deterministic: it either parses and checksums
// correctly, or it doesn't. That determinism is the whole reason this is
// worth doing instead of running the uploaded image through Gemini — no
// "the model misread a digit" failure mode exists here.
//
// merchantName/merchantCity/countryCode/pointOfInitiation/amount are
// top-level EMVCo fields at fixed tag numbers (00/01/53/54/58/59/60) —
// unambiguous, spec-fixed positions, high confidence.
//
// nmid is different: Bank Indonesia's QRIS domestic template (GUI
// "ID.CO.QRIS.WWW", carried in one of the root-level Merchant Account
// Information tags 02-51) does carry a National Merchant ID, but which
// sub-tag holds it varies across PJSP/acquirer implementations in the wild.
// Rather than assert a fixed sub-tag position we can't verify against every
// real payload, findQrisMerchantId returns the first non-GUI sub-field as a
// best-effort identifier. Treat qris_nmid as "best-effort merchant
// identifier", not a guaranteed-correct NMID — this is the "ship the weaker
// true claim" call for this field specifically.

export interface QrisFields {
  merchantName: string | null;
  merchantCity: string | null;
  countryCode: string | null;
  /** Best-effort merchant identifier — see header comment. Not guaranteed to be the exact NMID for every acquirer. */
  nmid: string | null;
  pointOfInitiation: 'STATIC' | 'DYNAMIC' | null;
  /** Only present for dynamic QRIS (point-of-initiation = DYNAMIC); static codes carry no amount. */
  amount: number | null;
  rawPayload: string;
}

export type QrisDecodeResult =
  | { status: 'ok'; fields: QrisFields }
  | { status: 'no_qr_found' }
  | { status: 'invalid_checksum' }
  | { status: 'not_qris' };

function crc16ccitt(input: string): string {
  // CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no input/output reflection —
  // the variant EMVCo's spec requires for tag 63.
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

interface TlvField {
  tag: string;
  value: string;
}

function parseTlv(data: string): TlvField[] {
  const fields: TlvField[] = [];
  let i = 0;
  while (i + 4 <= data.length) {
    const tag = data.slice(i, i + 2);
    const len = parseInt(data.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len)) break;
    const value = data.slice(i + 4, i + 4 + len);
    if (value.length < len) break; // truncated/corrupt — stop rather than return a partial field
    fields.push({ tag, value });
    i += 4 + len;
  }
  return fields;
}

function findQrisMerchantId(rootFields: TlvField[]): string | null {
  for (const f of rootFields) {
    const tagNum = parseInt(f.tag, 10);
    if (!Number.isFinite(tagNum) || tagNum < 2 || tagNum > 51) continue;
    const sub = parseTlv(f.value);
    const gui = sub.find((s) => s.tag === '00')?.value;
    if (gui !== 'ID.CO.QRIS.WWW') continue;
    const idField = sub.find((s) => s.tag !== '00');
    if (idField) return idField.value;
  }
  return null;
}

/** Parse+validate a raw EMVCo string already extracted from a QR code (exported for tests). */
export function parseEmvcoQris(rawPayload: string): QrisDecodeResult {
  // Tag 63 (CRC) is always the final field, 2-digit tag + "04" length + 4 hex
  // digits — 8 characters total at the end of the payload, per spec.
  const crcFieldStart = rawPayload.length - 8;
  if (crcFieldStart < 0) return { status: 'invalid_checksum' };
  const crcTag = rawPayload.slice(crcFieldStart, crcFieldStart + 2);
  const crcLen = rawPayload.slice(crcFieldStart + 2, crcFieldStart + 4);
  if (crcTag !== '63' || crcLen !== '04') return { status: 'invalid_checksum' };

  const dataForCrc = rawPayload.slice(0, crcFieldStart + 4);
  const claimedCrc = rawPayload.slice(crcFieldStart + 4).toUpperCase();
  if (crc16ccitt(dataForCrc) !== claimedCrc) return { status: 'invalid_checksum' };

  const fields = parseTlv(rawPayload);
  const formatIndicator = fields.find((f) => f.tag === '00')?.value;
  if (formatIndicator !== '01') return { status: 'not_qris' };

  const poi = fields.find((f) => f.tag === '01')?.value;
  const amountRaw = fields.find((f) => f.tag === '54')?.value;

  return {
    status: 'ok',
    fields: {
      merchantName: fields.find((f) => f.tag === '59')?.value ?? null,
      merchantCity: fields.find((f) => f.tag === '60')?.value ?? null,
      countryCode: fields.find((f) => f.tag === '58')?.value ?? null,
      nmid: findQrisMerchantId(fields),
      pointOfInitiation: poi === '11' ? 'STATIC' : poi === '12' ? 'DYNAMIC' : null,
      amount: amountRaw ? Number(amountRaw) : null,
      rawPayload,
    },
  };
}

const MAX_DECODE_BYTES = 10 * 1024 * 1024; // matches lib/db/storage.ts's upload cap

/**
 * Decode a QRIS QR code from an uploaded image. Downscales large photos
 * (phone-camera screenshots can be 4000px+) before handing raw RGBA pixels
 * to jsQR — bounds decode cost regardless of upload size, same reasoning
 * as storage.ts's MAX_UPLOAD_BYTES cap on the byte side.
 */
export async function decodeQrisImage(imageBytes: Buffer): Promise<QrisDecodeResult> {
  if (imageBytes.length > MAX_DECODE_BYTES) return { status: 'no_qr_found' };

  let data: Buffer;
  let info: { width: number; height: number };
  try {
    const raster = await sharp(imageBytes)
      .rotate() // respect EXIF orientation
      .resize({ width: 1200, withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = raster.data;
    info = raster.info;
  } catch {
    return { status: 'no_qr_found' }; // not a decodable image at all
  }

  const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
  if (!code) return { status: 'no_qr_found' };

  return parseEmvcoQris(code.data);
}
