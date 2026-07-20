-- B5 — public /cek page rate limiting. Same shape as identify_attempts/
-- accept_attempts/otp_send_attempts: a plain append-only attempt log,
-- counted over a rolling window by the calling action. Keyed on a hash of
-- the requester's IP, not the raw address — this app's general posture is
-- never storing a raw identifier when a hash serves the rate-limiting
-- purpose just as well (same treatment phone_e164 got for identify_attempts
-- in migration 0009's era, and phone_e164 got again for otp_send_attempts
-- in 0020 -- this is the first surface with no phone/deal context to key
-- on instead, since a cold /cek lookup has neither).
--
-- Anti-enumeration is the reason this exists at all: unlike every other
-- rate limiter in this app (which protects a specific deal/phone from
-- repeated guesses), this one protects the corpus itself from being
-- bulk-harvested by an anonymous caller with no deal token and no phone in
-- hand.

create table lookup_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index on lookup_attempts (ip_hash, attempted_at);

alter table lookup_attempts enable row level security;

create policy "service role full access on lookup_attempts"
  on lookup_attempts for all
  to service_role
  using (true)
  with check (true);
