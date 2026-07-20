-- Fold the separate DIAJUKAN "accept" step into joinDeal itself, per the
-- 2026-07-20 conversation resolving it: attestations already happen at
-- CREATE (proposer) and JOIN (counterpart) — the old accept step collected
-- zero new consent, it was a second phone re-entry purely to click "Setuju"
-- twice. The counterpart's join now atomically fires both COUNTERPART_JOINED
-- and ACCEPTED in one transaction: DRAF -> DISEPAKATI directly, no DIAJUKAN
-- resting state, no manual accept click from either party.
--
-- DIAJUKAN itself is left in deals' status CHECK constraint (not dropped) —
-- harmless to leave reachable-in-principle, and safer than a destructive
-- constraint edit for a status this migration simply stops writing.

-- ============================================================
-- join_deal_with_event replacement: two chained events (COUNTERPART_JOINED,
-- then ACCEPTED) in one guarded transaction, straight to DISEPAKATI. Same
-- row-lock + prior-hash-recheck pattern migration 0011 added to the old
-- accept RPCs — needed here for the same reason: both hashes are computed
-- client-side before the call, so a concurrent write landing between that
-- computation and this RPC must be caught, not silently forked.
-- ============================================================

drop function if exists join_deal_with_event(uuid, uuid, text, text, text, text);

create or replace function join_deal_with_event(
  p_deal_id           uuid,
  p_counterpart_id    uuid,
  p_join_prior_hash   text,
  p_join_new_hash     text,
  p_accept_prior_hash text,
  p_accept_new_hash   text,
  p_rekening_tujuan   text default null,
  p_rekening_bank     text default null
)
returns setof deals
language plpgsql
as $$
declare
  v_actual_prior_hash text;
  v_rows int;
begin
  perform 1 from deals where id = p_deal_id for update;

  select new_hash into v_actual_prior_hash
  from deal_events
  where deal_id = p_deal_id
  order by id desc
  limit 1;

  if v_actual_prior_hash is distinct from p_join_prior_hash then
    return; -- stale prior_hash -- a concurrent event landed first; caller retries
  end if;

  update deals
  set counterpart_id  = p_counterpart_id,
      status          = 'DISEPAKATI',
      rekening_tujuan = coalesce(p_rekening_tujuan, rekening_tujuan),
      rekening_bank   = coalesce(p_rekening_bank, rekening_bank)
  where id     = p_deal_id
    and status = 'DRAF';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return; -- race: deal already left DRAF
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'COUNTERPART', 'COUNTERPART_JOINED', p_join_prior_hash, p_join_new_hash, null);

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'ACCEPTED', p_accept_prior_hash, p_accept_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function join_deal_with_event(uuid, uuid, text, text, text, text, text, text) from public;
grant execute on function join_deal_with_event(uuid, uuid, text, text, text, text, text, text) to service_role;

-- ============================================================
-- Dead code removal: the old two-step accept mechanism (individual
-- proposer_accepted/counterpart_accepted flags, their RPCs, and the
-- phone-guess rate limiter that protected the accept screen) has no more
-- callers once app/deal/[token]/actions.ts's acceptDeal is removed. Left in
-- place, these would be exactly the kind of silently-dead-but-present
-- surface this app's own conventions warn against (Law 3/cohesion).
-- ============================================================

drop function if exists record_party_acceptance(uuid, text, text, text, text, text);
drop function if exists finalize_deal_acceptance(uuid, text, text);
drop table if exists accept_attempts;

alter table deals
  drop column if exists proposer_accepted,
  drop column if exists counterpart_accepted;
