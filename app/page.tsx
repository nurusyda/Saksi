import Link from 'next/link';
import { CANONICAL_DOMAIN, LANDING_TAGLINE } from '@/lib/copy';

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-white px-4">
      <main className="w-full max-w-sm flex flex-col gap-8 py-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">SAKSI</h1>
          <p className="text-base text-zinc-600 leading-relaxed">
            {LANDING_TAGLINE}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/buat"
            className="flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            Buat Kesepakatan
          </Link>
          <span
            aria-disabled="true"
            className="flex h-12 cursor-not-allowed items-center justify-center rounded-lg border border-zinc-200 px-6 text-sm font-medium text-zinc-400 pointer-events-none opacity-50"
          >
            Cek rekening atau nomor HP (segera hadir)
          </span>
        </div>
      </main>

      <footer className="w-full max-w-sm pb-8 text-xs text-zinc-400 leading-relaxed">
        {CANONICAL_DOMAIN}
      </footer>
    </div>
  );
}
