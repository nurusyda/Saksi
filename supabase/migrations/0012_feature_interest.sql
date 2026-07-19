-- Phone-hash-keyed opt-in for not-yet-available deal types (pinjam-meminjam,
-- sewa-menyewa), captured from the "beri tahu saat tersedia" checkboxes on
-- the create-deal form. Purpose-limited to notifying about that specific
-- feature — never merged into marketing consent, never read for anything
-- beyond "should this phone be notified when X ships".
--
-- Same posture as accept_attempts (0010): no legitimate public read/write use
-- case, service role only.

create table feature_interest (
  id uuid primary key default gen_random_uuid(),
  phone_hash text not null,
  feature text not null check (feature in ('pinjam_meminjam', 'sewa_menyewa')),
  opted_in_at timestamptz not null default now(),
  unique (phone_hash, feature)
);

alter table feature_interest enable row level security;

create policy "service role full access on feature_interest"
  on feature_interest for all
  to service_role
  using (true)
  with check (true);
