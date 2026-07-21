import type { Metadata } from 'next';
import { PageShell, PageTitle } from '@/components/ui';
import { MyDealsList } from './MyDealsList';
import { SAYA_HEADING, SAYA_INTRO } from '@/lib/copy';

// Same no-discovery posture as /cek (GATE 2): this page is reached from
// inside the app, never from search. It holds no corpus data — only tokens
// the visitor's own browser already stored — but there is no reason for it
// to be indexed either.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SayaPage() {
  return (
    <PageShell>
      <PageTitle title={SAYA_HEADING} subtitle={SAYA_INTRO} />
      <MyDealsList />
    </PageShell>
  );
}
