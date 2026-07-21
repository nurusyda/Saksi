import Link from 'next/link';
import {
  CANONICAL_DOMAIN,
  LANDING_HEADING,
  LANDING_SUBHEAD,
  LANDING_STEPS,
  CTA_BUAT_TAGIHAN,
} from '@/lib/copy';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-16">
        <p className="text-sm font-semibold tracking-wide text-zinc-400">SAKSI</p>

        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-zinc-900">
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

        <div className="mt-10">
          <Link
            href="/buat"
            className="flex h-12 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
          >
            {CTA_BUAT_TAGIHAN}
          </Link>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-md px-5 pb-8 text-xs text-zinc-400">
        {CANONICAL_DOMAIN}
      </footer>
    </div>
  );
}
