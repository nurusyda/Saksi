// Gemini multimodal OCR consistency check (integrations.md §6). Extracts
// {nominal, tanggal, rekening_tujuan, bank} from the uploaded bukti image;
// the verdict is computed here in code, never delegated to the model, so it
// can never emit "asli"/"terverifikasi" language — only the closed
// vocabulary in copy-id.md §5 is reachable.
//
// Plain REST call, no SDK dependency: one fetch, small surface, no install
// step. Live-tested against gemini-flash-lite-latest 2026-07-23 — correctly
// extracts nominal, tanggal, rekening_tujuan, and bank from Indonesian bank
// transfer screenshots.

export type OcrVerdict = 'KONSISTEN' | 'TIDAK_KONSISTEN' | 'TIDAK_TERBACA';

export interface OcrResult {
  amount_match: boolean | null;
  date_ok: boolean | null;
  rekening_match: boolean | null;
  bank_match: boolean | null;
}

interface ExtractedFields {
  nominal: number | null;
  tanggal: string | null; // YYYY-MM-DD
  rekening_tujuan: string | null;
  bank: string | null;
}

const GEMINI_MODEL = 'gemini-flash-lite-latest';

async function extractFieldsFromImage(
  imageBytes: Buffer,
  mimeType: string,
): Promise<ExtractedFields | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const prompt = `Extract these fields from this Indonesian bank transfer receipt image. Respond with JSON only, no prose, matching exactly this shape:
{"nominal": <integer IDR amount or null>, "tanggal": <transfer date as YYYY-MM-DD or null>, "rekening_tujuan": <destination account number, digits only, or null>, "bank": <destination bank name or null>}
Use null for any field that is not legible. If the image is not a transfer receipt at all, return all four fields as null.`;

  // Key goes in a header, not the ?key= query param — found by monster_check:
  // query strings are more likely to end up in server access logs / fetch
  // logging middleware than headers are.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000); // 8s; Vercel Hobby = 10s
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBytes.toString('base64') } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    },
  ).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[ocr] Gemini API error %d %s — %s', res.status, res.statusText, body.slice(0, 300));
    return null;
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return {
      nominal: typeof parsed.nominal === 'number' ? parsed.nominal : null,
      tanggal: typeof parsed.tanggal === 'string' ? parsed.tanggal : null,
      rekening_tujuan: typeof parsed.rekening_tujuan === 'string' ? parsed.rekening_tujuan : null,
      bank: typeof parsed.bank === 'string' ? parsed.bank : null,
    };
  } catch {
    console.error('[ocr] JSON parse failed on Gemini response text:', text.slice(0, 200));
    return null;
  }
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Compare OCR-extracted fields against the deal record and return a verdict
 * from the closed vocabulary. Never blocks the caller from proceeding on a
 * TIDAK_KONSISTEN result — copy-id.md §5/integrations.md §6: the mismatch
 * itself is evidence, not a reason to refuse the upload.
 */
export async function checkBuktiConsistency(
  imageBytes: Buffer,
  mimeType: string,
  deal: { amount_idr: number; rekening_tujuan: string; rekening_bank: string; deadline: string },
): Promise<{ ocrResult: OcrResult; verdict: OcrVerdict }> {
  let extracted: ExtractedFields | null;
  try {
    extracted = await extractFieldsFromImage(imageBytes, mimeType);
  } catch (err) {
    console.error('[ocr] extraction failed:', err instanceof Error ? err.message : String(err));
    extracted = null;
  }

  if (!extracted || (extracted.nominal === null && extracted.rekening_tujuan === null)) {
    return {
      ocrResult: { amount_match: null, date_ok: null, rekening_match: null, bank_match: null },
      verdict: 'TIDAK_TERBACA',
    };
  }

  const amount_match = extracted.nominal !== null ? extracted.nominal === deal.amount_idr : null;
  const rekening_match =
    extracted.rekening_tujuan !== null
      ? digitsOnly(extracted.rekening_tujuan) === digitsOnly(deal.rekening_tujuan)
      : null;
  const bank_match =
    extracted.bank !== null
      ? extracted.bank.toLowerCase().includes(deal.rekening_bank.toLowerCase()) ||
        deal.rekening_bank.toLowerCase().includes(extracted.bank.toLowerCase())
      : null;
  // Informational only, not part of the mismatch signal below: a late
  // transfer is still a transfer.
  const date_ok = extracted.tanggal !== null ? extracted.tanggal <= deal.deadline : null;

  const ocrResult: OcrResult = { amount_match, date_ok, rekening_match, bank_match };
  const anyMismatch = [amount_match, rekening_match, bank_match].some((v) => v === false);
  const verdict: OcrVerdict = anyMismatch ? 'TIDAK_KONSISTEN' : 'KONSISTEN';

  return { ocrResult, verdict };
}

// ============================================================
// QRIS variant (migration 0036) — a QRIS payment confirmation screenshot
// (the buyer's own banking/e-wallet app's "Berhasil" screen) shows a
// merchant name, not a bank account number, so the consistency check
// compares against qris_merchant_name instead of rekening_tujuan/bank.
// Same closed-vocabulary/never-blocks-upload posture as the rekening path.
// ============================================================

export interface QrisOcrResult {
  amount_match: boolean | null;
  date_ok: boolean | null;
  merchant_name_match: boolean | null;
}

interface QrisExtractedFields {
  nominal: number | null;
  tanggal: string | null;
  merchant_name: string | null;
}

async function extractQrisFieldsFromImage(
  imageBytes: Buffer,
  mimeType: string,
): Promise<QrisExtractedFields | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const prompt = `Extract these fields from this Indonesian QRIS payment confirmation screenshot (a banking or e-wallet app's "Berhasil"/success screen). Respond with JSON only, no prose, matching exactly this shape:
{"nominal": <integer IDR amount or null>, "tanggal": <payment date as YYYY-MM-DD or null>, "merchant_name": <the merchant/recipient name shown, or null>}
Use null for any field that is not legible. If the image is not a QRIS payment confirmation at all, return all three fields as null.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBytes.toString('base64') } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: controller.signal,
    },
  ).finally(() => clearTimeout(timeout));

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[ocr] Gemini API error (qris) %d %s — %s', res.status, res.statusText, body.slice(0, 300));
    return null;
  }

  const json = await res.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    return {
      nominal: typeof parsed.nominal === 'number' ? parsed.nominal : null,
      tanggal: typeof parsed.tanggal === 'string' ? parsed.tanggal : null,
      merchant_name: typeof parsed.merchant_name === 'string' ? parsed.merchant_name : null,
    };
  } catch {
    console.error('[ocr] JSON parse failed on Gemini response text (qris):', text.slice(0, 200));
    return null;
  }
}

// Loose substring match, same reasoning as bank_match above: OCR'd merchant
// names and the name decoded from the QRIS itself commonly differ in
// casing/spacing/abbreviation, so an exact match would flag genuine payments
// as inconsistent far too often.
function namesRoughlyMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = norm(a);
  const nb = norm(b);
  return na.length > 0 && nb.length > 0 && (na.includes(nb) || nb.includes(na));
}

export async function checkQrisBuktiConsistency(
  imageBytes: Buffer,
  mimeType: string,
  deal: { amount_idr: number; deadline: string; qris_merchant_name: string },
): Promise<{ ocrResult: QrisOcrResult; verdict: OcrVerdict }> {
  let extracted: QrisExtractedFields | null;
  try {
    extracted = await extractQrisFieldsFromImage(imageBytes, mimeType);
  } catch (err) {
    console.error('[ocr] qris extraction failed:', err instanceof Error ? err.message : String(err));
    extracted = null;
  }

  if (!extracted || (extracted.nominal === null && extracted.merchant_name === null)) {
    return {
      ocrResult: { amount_match: null, date_ok: null, merchant_name_match: null },
      verdict: 'TIDAK_TERBACA',
    };
  }

  const amount_match = extracted.nominal !== null ? extracted.nominal === deal.amount_idr : null;
  const merchant_name_match =
    extracted.merchant_name !== null ? namesRoughlyMatch(extracted.merchant_name, deal.qris_merchant_name) : null;
  const date_ok = extracted.tanggal !== null ? extracted.tanggal <= deal.deadline : null;

  const ocrResult: QrisOcrResult = { amount_match, date_ok, merchant_name_match };
  const anyMismatch = [amount_match, merchant_name_match].some((v) => v === false);
  const verdict: OcrVerdict = anyMismatch ? 'TIDAK_KONSISTEN' : 'KONSISTEN';

  return { ocrResult, verdict };
}
