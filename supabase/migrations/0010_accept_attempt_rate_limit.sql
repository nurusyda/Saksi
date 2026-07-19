-- Rate-limit phone-guess attempts on the accept screen (app/deal/[token]'s
-- acceptDeal). The deal token is unguessable, but if a specific token leaks,
-- this stops rapid-fire enumeration of which phone numbers match its two
-- parties (the match/no-match error difference is otherwise an oracle).
--
-- Deliberately not deal_events: that table is the hash-chained, tamper-evident
-- record of actual state changes/consent. A phone-guess attempt (match or not)
-- isn't a state transition and doesn't belong in that chain.

create table accept_attempts (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals (id),
  attempted_at timestamptz not null default now()
);

create index on accept_attempts (deal_id, attempted_at);

-- Service role only — no legitimate public read/write use case, unlike
-- deals/parties/deal_events/flags which all have some public projection.
alter table accept_attempts enable row level security;

create policy "service role full access on accept_attempts"
  on accept_attempts for all
  to service_role
  using (true)
  with check (true);
