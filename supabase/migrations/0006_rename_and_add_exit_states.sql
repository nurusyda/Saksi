-- Rename DIBATALKAN_SEPIHAK_PRA_BAYAR -> TIDAK_DILANJUTKAN and add two new
-- terminal exit states (KEDALUWARSA, DIKEMBALIKAN_SEBAGIAN) to deals.status,
-- per data-model.md's locked exit-state taxonomy.

-- Backfill first: unlike 0005 (which had no live rows in the retired value),
-- we don't have that assurance here. No-op if the table has no such rows.
update deals set status = 'TIDAK_DILANJUTKAN' where status = 'DIBATALKAN_SEPIHAK_PRA_BAYAR';

-- Same structural catalog lookup as 0005_update_proposer_roles.sql: the
-- original constraint (from 0001) is unnamed, so resolve it via conkey
-- membership rather than a text match on pg_get_constraintdef.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attname  = 'status'
  where c.conrelid = 'deals'::regclass
    and c.contype  = 'c'
    and a.attnum   = any(c.conkey)
  limit 1;

  if v_constraint is not null then
    execute 'alter table deals drop constraint ' || quote_ident(v_constraint);
  end if;
end $$;

alter table deals add constraint deals_status_check
  check (status in (
    'DRAF',
    'DIAJUKAN',
    'DISEPAKATI',
    'DIBAYAR_DIKLAIM',
    'DIKONFIRMASI_TERIMA',
    'SELESAI',
    'DIBATALKAN_BERSAMA',
    'TIDAK_DILANJUTKAN',
    'KEDALUWARSA',
    'DIKEMBALIKAN_PENUH',
    'DIKEMBALIKAN_SEBAGIAN',
    'TIDAK_DIPENUHI',
    'SENGKETA'
  ));
