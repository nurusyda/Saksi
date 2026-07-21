import { DealShareButton } from './DealShareButton';
import { DEAL_LINK_CARD_HEADING, DEAL_LINK_SAVE_HINT, SHARE_TO_WHATSAPP_LABEL } from '@/lib/copy';

// UX-audit fix pass (2026-07-20) — "lost link = lost deal": identity is
// phone-only with no session, so the capability URL *is* the deal. The old
// share block only rendered in DRAF (page.tsx's original inline version);
// this renders on every status so a party who lands here mid-flow (e.g. from
// a WA nudge, or reopening an old chat message) always has a one-tap way to
// re-save the link, not just at creation time.
//
// "Bagikan ke WhatsApp" deliberately uses a client-side wa.me share intent
// (opens the visitor's own WhatsApp with the text prefilled, letting them
// send it to themselves or forward it) rather than a server-side send to a
// typed-in phone number — the latter would be an open WA-send relay with no
// rate limit tied to a real recipient, a spam/abuse surface this feature
// doesn't need to introduce.
export function DealLinkCard({ url, itemDesc }: { url: string; itemDesc: string }) {
  const waText = encodeURIComponent(`Tagihan SAKSI: "${itemDesc}" - ${url}`);
  const waHref = `https://wa.me/?text=${waText}`;

  return (
    <div className="mb-6 rounded-xl border border-zinc-200 p-5">
      <p className="mb-1 text-sm font-medium text-zinc-700">{DEAL_LINK_CARD_HEADING}</p>
      <p className="mb-3 text-xs text-zinc-500">{DEAL_LINK_SAVE_HINT}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-800">
          {url}
        </code>
        <DealShareButton url={url} />
      </div>
      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex h-10 w-full items-center justify-center rounded-lg border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        {SHARE_TO_WHATSAPP_LABEL}
      </a>
    </div>
  );
}
