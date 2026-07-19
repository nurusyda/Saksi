-- Extend feature_interest (0012) to also cover the paid-tier "notify me"
-- checkboxes on LIMA_RIBU/BERMETERAI, which shipped in Phase 0.6 with no
-- backend at all (dead <input>, no name attribute — found during review of
-- the jenis-transaksi checkboxes built alongside it, which made the
-- inconsistency obvious: identical-looking checkboxes, only one of the two
-- pairs actually did anything).
--
-- Same structural catalog lookup as 0005/0006: don't assume Postgres's
-- default inline-check naming, resolve it via conkey membership instead.

do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attname  = 'feature'
  where c.conrelid = 'feature_interest'::regclass
    and c.contype  = 'c'
    and a.attnum   = any(c.conkey)
  limit 1;

  if v_constraint is not null then
    execute 'alter table feature_interest drop constraint ' || quote_ident(v_constraint);
  end if;
end $$;

alter table feature_interest add constraint feature_interest_feature_check
  check (feature in ('pinjam_meminjam', 'sewa_menyewa', 'tier_lima_ribu', 'tier_bermeterai'));
