-- Rate-limit getDealStatus (paymentActions.ts), the bare-status poll backing
-- WaitingStatusPoll.tsx. Different threat shape than identify_attempts
-- (0017)/lookup_attempts (0024): getDealStatus takes no phone and returns
-- only an enum status already visible to anyone holding the deal link, so
-- there's no guess-and-check oracle to protect against here — this is
-- purely resource-abuse protection on an unbounded read keyed by a
-- caller-supplied token. Flagged by monster_check (2026-07-21).
--
-- New table rather than reusing identify_attempts, same reasoning 0017 gave
-- for not reusing accept_attempts: a different call site with a different
-- legitimate-traffic shape (WaitingStatusPoll polls every ~12s from up to
-- two viewers on the same deal) needs its own threshold, not one shared
-- with — and fighting against — identify's much stricter guess-limiting one.

create table deal_status_poll_attempts (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals (id),
  attempted_at timestamptz not null default now()
);

create index on deal_status_poll_attempts (deal_id, attempted_at);

alter table deal_status_poll_attempts enable row level security;

create policy "service role full access on deal_status_poll_attempts"
  on deal_status_poll_attempts for all
  to service_role
  using (true)
  with check (true);
