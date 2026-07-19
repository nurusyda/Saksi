-- Fix a hash-chain fork: prior_hash/new_hash are computed client-side (in
-- TypeScript) before either RPC call runs. If both parties submit acceptance
-- concurrently, both compute their hash against the same stale prior_hash
-- and both RPCs could insert a deal_events row chained to it — forking the
-- history instead of extending it linearly. The same race applies to
-- finalize_deal_acceptance: two individual-accept flows can each reach the
-- "both flags true, fire ACCEPTED" step around the same time.
--
-- Fix: lock the deal row first (serializes concurrent calls on the same
-- deal), then re-check the actual latest deal_events.new_hash under that
-- lock against the caller-supplied p_prior_hash. A mismatch means a
-- concurrent write already landed since the caller computed its hash —
-- return 0 rows (safe no-op); the caller retries with a freshly-fetched
-- prior_hash.

create or replace function record_party_acceptance(
  p_deal_id     uuid,
  p_flag_column text,
  p_event       text,
  p_actor       text,
  p_prior_hash  text,
  p_new_hash    text
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
    return; -- stale prior_hash — a concurrent event landed first; caller retries
  end if;

  if p_flag_column = 'proposer_accepted' then
    update deals
    set proposer_accepted = true
    where id = p_deal_id
      and status = 'DIAJUKAN'
      and proposer_accepted = false;
  elsif p_flag_column = 'counterpart_accepted' then
    update deals
    set counterpart_accepted = true
    where id = p_deal_id
      and status = 'DIAJUKAN'
      and counterpart_accepted = false;
  else
    raise exception 'record_party_acceptance: invalid flag column %', p_flag_column;
  end if;

  if not found then
    return; -- already accepted by this party, or deal no longer DIAJUKAN
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, p_event, p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

create or replace function finalize_deal_acceptance(
  p_deal_id    uuid,
  p_prior_hash text,
  p_new_hash   text
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
    return; -- stale prior_hash; caller retries
  end if;

  update deals
  set status = 'DISEPAKATI'
  where id = p_deal_id
    and status = 'DIAJUKAN'
    and proposer_accepted
    and counterpart_accepted;

  if not found then
    return; -- precondition no longer holds (already finalized, or a flag reverted)
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'ACCEPTED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

-- CREATE OR REPLACE preserves existing grants, but re-affirming explicitly
-- since it's cheap and matches this codebase's defensive style elsewhere.
revoke execute on function record_party_acceptance(uuid, text, text, text, text, text) from public;
revoke execute on function finalize_deal_acceptance(uuid, text, text) from public;
