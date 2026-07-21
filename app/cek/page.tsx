import type { Metadata } from 'next';
import { CekForm } from './CekForm';
import { PageShell } from '@/components/ui';

// GATE 2 — noindex + no inbound links (Option A distribution: invite-only,
// no discovery surface, until PSE Kominfo clears). This metadata is the
// crawler-facing half of that; the human-facing half is that nothing in
// this app links here — see CekForm.tsx's header comment. Both halves stay
// in place even after this page is otherwise feature-complete, until GATE 2
// clears (not just GATE 1 — this page also depends on GATE 1's publication
// switch being on, or every lookup here just returns "empty"/pre-window
// buckets only).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CekPage() {
  return (
    <PageShell>
      <CekForm />
    </PageShell>
  );
}
