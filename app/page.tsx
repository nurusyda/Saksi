import Link from 'next/link';
import {
  CANONICAL_DOMAIN,
  LANDING_HEADING,
  LANDING_SUBHEAD,
  LANDING_STEPS,
  CTA_BUAT_TAGIHAN,
  CTA_LIHAT_TAGIHAN_SAYA,
} from '@/lib/copy';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <p className="text-sm font-semibold tracking-wide text-zinc-400">SAKSI</p>

        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
          {LANDING_HEADING}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-zinc-600">{LANDING_SUBHEAD}</p>

        <ol className="mt-10 flex flex-col gap-5">
          {LANDING_STEPS.map((s, i) => (
            <li key={i} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <div className="pt-0.5">
                <p className="text-sm font-semibold text-zinc-900">{s.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/buat"
            className="flex h-12 items-center justify-center rounded-xl bg-witness px-6 text-sm font-semibold text-white transition-colors hover:bg-witness-hover"
          >
            {CTA_BUAT_TAGIHAN}
          </Link>
          {/* §32 — the way back to a tagihan whose link was lost. Secondary
              on purpose: creating is the primary act, this is recovery. */}
          <Link
            href="/saya"
            className="flex h-12 items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50"
          >
            {CTA_LIHAT_TAGIHAN_SAYA}
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-xl px-4 pb-8 text-xs text-zinc-400 sm:px-6">
        {CANONICAL_DOMAIN}
      </footer>
    </div>
  );
}
