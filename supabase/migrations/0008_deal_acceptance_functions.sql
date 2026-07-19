-- Acceptance RPCs for DIAJUKAN -> DISEPAKATI, split into two steps:
--   1. record_party_acceptance: one party's individual consent. Guarded UPDATE of
--      their flag column + INSERT of the corresponding deal_events row, in one
--      transaction. Returns 0 rows if that party already accepted, or the deal is
--      no longer DIAJUKAN (caller treats either as a no-op, not an error).
--   2. finalize_deal_acceptance: fires only once both flags are true. Guarded
--      UPDATE of status to DISEPAKATI + INSERT of the ACCEPTED event, in one
--      transaction. Returns 0 rows if the precondition no longer holds (e.g. a
--      concurrent call already finalized it).
--
-- Same SECURITY INVOKER / revoke-from-public pattern as create_deal_with_event
-- and join_deal_with_event (0004): both rely on the calling code already using
-- the service-role client, which bypasses RLS on its own.

create or replace function record_party_acceptance(
  p_deal_id     uuid,
  p_flag_column text,   -- 'proposer_accepted' or 'counterpart_accepted'
  p_event       text,
  p_actor       text,
  p_prior_hash  text,
  p_new_hash    text
)
returns setof deals
language plpgsql
as $$
begin
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
begin
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

revoke execute on function record_party_acceptance(uuid, text, text, text, text, text) from public;
revoke execute on function finalize_deal_acceptance(uuid, text, text) from public;
