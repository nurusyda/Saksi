-- Update the proposer_role CHECK constraint to match the current role taxonomy.
--
-- Retiring: PENERIMA_TITIPAN (custodian/jastip use case — folded into LAINNYA
--   for existing records; no active deals with this role as of this migration)
-- Adding: PEMINJAM (borrower), PEMILIK (asset owner), PENYEWA (renter)
--
-- The existing constraint was created inline in 0001 with no explicit name, so
-- Postgres assigned the name automatically. We resolve it via a structural
-- catalog join (pg_attribute attnum membership in conkey) rather than a text
-- pattern on pg_get_constraintdef, which avoids false-positives from future
-- constraints whose DDL text might also mention the column name. LIMIT 1 is a
-- defensive guard; only one CHECK constraint on this column should ever exist.

do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attname  = 'proposer_role'
  where c.conrelid = 'deals'::regclass
    and c.contype  = 'c'
    and a.attnum   = any(c.conkey)
  limit 1;

  if v_constraint is not null then
    execute 'alter table deals drop constraint ' || quote_ident(v_constraint);
  end if;
end $$;

alter table deals add constraint deals_proposer_role_check
  check (proposer_role in (
    'PENJUAL',
    'PEMBELI',
    'PEMBERI_PINJAMAN',
    'PEMINJAM',
    'PEMILIK',
    'PENYEWA',
    'LAINNYA'
  ));
