-- ============================================================
-- 0035 — flag retraction + deal_events RLS lockdown
--
-- 1. Flag retraction: the original reporter (PEMBELI) can retract a published
--    flag with a reason. The flag stays in the DB (history is preserved), but
--    retracted_at is set so the flag page can show the retraction status.
--    Hash-chained like every other event.
--
-- 2. deal_events RLS: public SELECT (using true) was the one remaining table
--    anon could read directly. Locked to service_role only, matching bukti,
--    deal_statements, breach_notes, and every other non-public table. The deal
--    page already reads deal_events via supabaseServer() (service role) — no
--    client path is affected.
-- ============================================================

-- === Flag retraction ===

alter table flags add column retracted_at timestamptz;
alter table flags add column retraction_reason text;

create or replace function retract_flag_with_event(
  p_deal_id            uuid,
  p_actor              text,
  p_retraction_reason  text,
  p_prior_hash         text,
  p_new_hash           text
)
returns setof deals
language plpgsql
as $$
declare
  v_actual_prior_hash text;
begin
  perform 1 from deals where id = p_deal_id for update;

  select new_hash into v_actual_prior_hash
  from deal_events
  where deal_id = p_deal_id
  order by id desc
  limit 1;

  if v_actual_prior_hash is distinct from p_prior_hash then
    return;
  end if;

  -- Only retract a flag that is published and not already retracted.
  update flags
  set retracted_at = now(),
      retraction_reason = p_retraction_reason
  where deal_id = p_deal_id
    and published_at is not null
    and retracted_at is null;

  if not found then
    return;
  end if;

  -- Self-transition — status unchanged. The retraction is recorded as an event
  -- so the hash chain witnesses it.
  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'FLAG_RETRACTED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function retract_flag_with_event(uuid, text, text, text, text) from public;
grant execute on function retract_flag_with_event(uuid, text, text, text, text) to service_role;

-- === deal_events RLS lockdown ===

-- Drop the public-read policy. The anon/authenticated roles no longer have any
-- SELECT access to deal_events. All reads go through supabaseServer() (service
-- role), matching the pattern already used for bukti, deal_statements,
-- breach_notes, hak_jawab_evidence, and report_evidence.
drop policy if exists "public read deal_events" on deal_events;
