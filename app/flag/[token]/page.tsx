import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabase/server';
import { renderFlag, type FlagTier, type FlagRung } from '@/lib/flags/render';
import { shortHashFragment } from '@/lib/format';
import {
  CANONICAL_DOMAIN,
  formatFlagRekeningLine,
  formatFlagPhoneVerifiedLine,
  FLAG_IDENTITY_VERIFIED_LINE,
} from '@/lib/copy';

// GATE 2 — noindex until PSE Kominfo clears. Same treatment as /cek.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function FlagPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const db = supabaseServer();

  // Look up the deal by token to get its id and tier.
  const { data: deal } = await db
    .from('deals')
    .select('id, tier')
    .eq('token', token)
    .single();

  if (!deal) notFound();

  // flags table is service-role-readable here (no anon RLS path in server
  // components), so the published_at gate must be explicit — mirror the
  // RLS policy's own condition exactly.
  const { data: flag } = await db
    .from('flags')
    .select('rung, identifiers, hak_jawab_status')
    .eq('deal_id', deal.id)
    .not('published_at', 'is', null)
    .maybeSingle();

  if (!flag) notFound();

  // The date on a flag is the date of the originating TENGGAT_LEWAT event
  // (copy-id.md §7 convention: [tgl] = date of the specific transition).
  const { data: filedEvent } = await db
    .from('deal_events')
    .select('created_at')
    .eq('deal_id', deal.id)
    .eq('event', 'TENGGAT_LEWAT')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!filedEvent) notFound();

  const disputed = flag.hak_jawab_status === 'DISPUTED';
  const identifiers = (flag.identifiers ?? {}) as Record<string, unknown>;
  const hasEvidence = identifiers.has_evidence === true;

  const bank = typeof identifiers.bank === 'string' ? identifiers.bank : null;
  const rekeningMasked = typeof identifiers.rekening_masked === 'string' ? identifiers.rekening_masked : null;
  const phoneHash = typeof identifiers.phone_hash === 'string' ? identifiers.phone_hash : null;
  const identityVerified = identifiers.identity_verified === true;

  const rendered = renderFlag({
    rung: flag.rung as FlagRung,
    tier: deal.tier as FlagTier,
    filedAtIso: filedEvent.created_at,
    disputed,
    hasEvidence,
  });

  return (
    <div className="min-h-screen bg-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <a href="/" className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-800">
          ← SAKSI
        </a>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-sm text-zinc-700">{rendered.rungLine}</p>
          <p className="mt-3 text-sm text-zinc-700">{rendered.body}</p>

          {rendered.evidenceLine && (
            <p className="mt-2 text-sm text-zinc-600">{rendered.evidenceLine}</p>
          )}

          {(bank || phoneHash || identityVerified) && (
            <div className="mt-4 border-t border-zinc-200 pt-3 text-xs text-zinc-500">
              {bank && rekeningMasked && <p>{formatFlagRekeningLine(bank, rekeningMasked)}</p>}
              {phoneHash && <p>{formatFlagPhoneVerifiedLine(shortHashFragment(phoneHash))}</p>}
              {identityVerified && <p>{FLAG_IDENTITY_VERIFIED_LINE}</p>}
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-400">{CANONICAL_DOMAIN}</p>
      </div>
    </div>
  );
}
