-- ============================================================
-- 0032 — the same bounded clarification loop for goods, not just payment
--
-- §30 gave the payment dispute a two-round exchange: the penjual says the
-- money did not arrive, the pembeli answers with a corrected bukti, twice at
-- most, and only then does the formal breach path take over.
--
-- The goods side had no equivalent. "Barang tidak sesuai kesepakatan" went
-- straight to a filed report (TENGGAT_LEWAT -> TIDAK_DIPENUHI -> 14-day hak
-- jawab -> klaim berbeda), so the first time a buyer said "this is not what
-- I ordered" it became a permanent breach record — even when the real cause
-- was the sort of thing one message clears up: the wrong variant shipped, a
-- missing accessory, a delivery still in transit.
--
-- Now both sides work the same way. The buyer states the problem, the seller
-- answers, up to two rounds each, all of it recorded and attributed. The
-- formal report path is untouched and still available; this sits in front of
-- it, not instead of it.
--
-- Two new statement kinds:
--   BARANG_TIDAK_SESUAI — the pembeli's account of what is wrong
--   PENJUAL_JAWAB       — the penjual's answer to it
--
-- and one generic RPC replacing the DANA_BELUM_MASUK-specific one, so the
-- two loops cannot drift apart. record_dana_belum_masuk_with_event (0029) is
-- dropped in the same breath: keeping a near-identical second copy of a
-- hash-chaining function is exactly how ledger writes diverge.
-- ============================================================

alter table deal_statements drop constraint if exists deal_statements_kind_check;
alter table deal_statements add constraint deal_statements_kind_check
  check (kind in ('DANA_BELUM_MASUK', 'BARANG_TIDAK_SESUAI', 'PENJUAL_JAWAB'));

-- ============================================================
-- record_deal_statement_with_event — one party's attributed account of what
-- happened, recorded against the deal without moving it.
--
-- Generalizes 0029's function along the two axes that actually differ
-- between the payment and goods loops: which status the deal must be in, and
-- which event name lands in deal_events. Everything else — the row lock, the
-- prior-hash recheck, the statement row, the hash-only payload — is
-- identical, and now lives in exactly one place.
--
-- Pure self-transition, deliberately: no UPDATE on deals, no flags row, no
-- publication. A statement is evidence of disagreement, not an adjudication
-- of it, and it must never shortcut into the breach pipeline. The caller
-- (TypeScript) enforces the round limit; this function enforces the state
-- machine and writes what it is given, same division of labour as every
-- other RPC here.
-- ============================================================

create or replace function record_deal_statement_with_event(
  p_deal_id        uuid,
  p_actor          text,
  p_kind           text,
  p_body           text,
  p_body_hash      text,
  p_required_status text,
  p_event          text,
  p_prior_hash     text,
  p_new_hash       text
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

  if not exists (
    select 1 from deals where id = p_deal_id and status = p_required_status
  ) then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, p_event,
    jsonb_build_object('body_hash', p_body_hash),
    p_prior_hash, p_new_hash, null
  );

  insert into deal_statements (deal_id, actor, kind, body)
  values (p_deal_id, p_actor, p_kind, p_body);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function record_deal_statement_with_event(uuid, text, text, text, text, text, text, text, text) from public;
grant  execute on function record_deal_statement_with_event(uuid, text, text, text, text, text, text, text, text) to service_role;

-- Superseded by the generic function above. Dropped rather than left dormant:
-- two hash-chaining writers for the same table is how ledger logic drifts.
drop function if exists record_dana_belum_masuk_with_event(uuid, text, text, text, text, text);
