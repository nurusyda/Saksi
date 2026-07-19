import Link from 'next/link';

export function PrivacyLink() {
  return (
    <p className="text-xs text-zinc-400">
      Lihat juga:{' '}
      <Link href="/privasi" className="underline">
        Kebijakan Privasi & Retensi Data
      </Link>
    </p>
  );
}
