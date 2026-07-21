import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

// §44 — download the stored .ots proof for a given deal_events.new_hash, so
// the OTS acceptance test is literally runnable: `ots verify <downloaded>`
// against the reference client is what must pass before OTS_ANCHORING_ENABLED
// is flipped in production.
//
// Keyed on the full 64-hex new_hash, which is a SHA-256 the caller must
// already know — this exposes no PII (a timestamp proof of a hash is not
// personal data, and the hash itself is opaque), and it is read-only. Returns
// 404 when no proof is stored, which is the normal state while anchoring is
// disabled.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return NextResponse.json({ error: 'invalid hash' }, { status: 400 });
  }

  const db = supabaseServer();
  const { data } = await db
    .from('deal_events')
    .select('ots_proof')
    .eq('new_hash', hash)
    .not('ots_proof', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!data?.ots_proof) {
    return NextResponse.json({ error: 'no proof for this hash' }, { status: 404 });
  }

  // Supabase returns bytea as a \x-prefixed hex string over the REST API.
  const raw = data.ots_proof as unknown as string;
  const bytes = Buffer.from(raw.startsWith('\\x') ? raw.slice(2) : raw, 'hex');

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${hash.slice(0, 16)}.ots"`,
    },
  });
}
