-- Rate-limit phone-guess attempts on identifyParty (paymentActions.ts),
-- the party-identification gate shared by every post-DISEPAKATI screen
-- (C3/C4/C5). Same threat as accept_attempts (0010) — the deal token is
-- unguessable, but if it leaks, an unrated identifyParty would let an
-- attacker enumerate which phone numbers belong to this deal's two parties
-- and which role each holds (the match/no-match response is otherwise an
-- oracle). Found by monster_check: this endpoint reintroduced that exact
-- oracle without 0010's protection.
--
-- Separate table from accept_attempts rather than reusing it: accept_attempts
-- already shipped as part of the committed Slice 2 backend and may be live
-- in production — renaming/repurposing a live table for a second endpoint
-- is a bigger, riskier change than adding a new one with identical shape.

create table identify_attempts (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals (id),
  attempted_at timestamptz not null default now()
);

create index on identify_attempts (deal_id, attempted_at);

alter table identify_attempts enable row level security;

create policy "service role full access on identify_attempts"
  on identify_attempts for all
  to service_role
  using (true)
  with check (true);
