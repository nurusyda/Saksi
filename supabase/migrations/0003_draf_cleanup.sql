-- Auto-delete DRAF deals older than 7 days (PII hygiene).
-- Walking away from an unformed deal is a right — no record survives.
--
-- Requires pg_cron extension (available on Supabase free plan).
-- If pg_cron is not enabled on the project, enable it via:
--   Dashboard → Database → Extensions → pg_cron

create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-draf-deals',
  '0 3 * * *',  -- 03:00 UTC daily
  $$
    delete from deals
    where status = 'DRAF'
      and created_at < now() - interval '7 days';
  $$
);
