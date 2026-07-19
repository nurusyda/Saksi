-- Private storage bucket for bukti transfer/refund images (C3). Same posture
-- as the bukti table itself (0001): service role only, no public read —
-- storage_path is never exposed to clients; images are served only via
-- signed URLs generated server-side where a future screen needs to display
-- one (e.g. the evidence-pack PDF, Phase 6+).
--
-- storage.objects has RLS enabled by default on Supabase projects; no
-- `alter table ... enable row level security` needed here.

insert into storage.buckets (id, name, public)
values ('bukti', 'bukti', false)
on conflict (id) do nothing;

create policy "service role full access on bukti objects"
  on storage.objects for all
  to service_role
  using (bucket_id = 'bukti')
  with check (bucket_id = 'bukti');
