import Link from 'next/link';
import { TC_LABEL } from '@/lib/copy';

const LINK_TEXT = 'Syarat & Ketentuan';

export function TCLabel() {
  const idx = TC_LABEL.indexOf(LINK_TEXT);
  const before = TC_LABEL.slice(0, idx);
  const after = TC_LABEL.slice(idx + LINK_TEXT.length);
  return (
    <span>
      {before}
      <Link href="/syarat" className="underline">
        {LINK_TEXT}
      </Link>
      {after}
    </span>
  );
}
