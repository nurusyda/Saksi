-- Atomic deal-write functions.
--
-- Each function performs two INSERTs (or one UPDATE + one INSERT) inside a
-- single implicit PL/pgSQL transaction. If either statement fails, the whole
-- unit is rolled back — no deal can exist without its initial event, and no
-- state transition can advance without its event record.
--
-- Both functions use SECURITY INVOKER (default): they run with the privileges
-- of the calling role. All callers use the service_role client, which already
-- bypasses RLS, so no SECURITY DEFINER is needed — and using DEFINER here
-- would allow the anon role to bypass RLS via PostgREST, which is wrong.
--
-- p_id is a client-generated UUID (crypto.randomUUID() in TypeScript) so the
-- caller can include the deal ID in the canonical hash payload before the write.
-- created_at is not in the canonical payload, so this pre-computation is safe.

-- ============================================================
-- create_deal_with_event
-- Replaces the separate INSERT deals / INSERT deal_events pair in createDeal.
-- ============================================================
create or replace function create_deal_with_event(
  p_id              uuid,
  p_token           text,
  p_tier            text,
  p_proposer_id     uuid,
  p_proposer_role   text,
  p_item_desc       text,
  p_amount_idr      bigint,
  p_rekening_tujuan text,
  p_rekening_bank   text,
  p_deadline        date,
  p_new_hash        text
)
returns setof deals
language plpgsql
as $$
begin
  insert into deals (
    id, token, tier, proposer_id, proposer_role,
    item_desc, amount_idr, rekening_tujuan, rekening_bank,
    deadline, status, meterai_applied
  ) values (
    p_id, p_token, p_tier, p_proposer_id, p_proposer_role,
    p_item_desc, p_amount_idr, p_rekening_tujuan, p_rekening_bank,
    p_deadline, 'DRAF', false
  );

  insert into deal_events (
    deal_id, actor, event, prior_hash, new_hash, ots_proof
  ) values (
    p_id, 'PROPOSER', 'CREATED', null, p_new_hash, null
  );

  return query select * from deals where id = p_id;
end;
$$;

-- ============================================================
-- join_deal_with_event
-- Replaces the separate UPDATE deals / INSERT deal_events pair in joinDeal.
--
-- Returns the updated deal row on success.
-- Returns 0 rows if the deal was no longer in DRAF (concurrent join won the
-- race) — caller detects this via .single() PGRST116 and surfaces the
-- "already closed" error.
-- ============================================================
create or replace function join_deal_with_event(
  p_deal_id        uuid,
  p_counterpart_id uuid,
  p_prior_hash     text,
  p_new_hash       text
)
returns setof deals
language plpgsql
as $$
declare
  v_rows int;
begin
  update deals
  set counterpart_id = p_counterpart_id,
      status         = 'DIAJUKAN'
  where id     = p_deal_id
    and status = 'DRAF';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Race condition: a concurrent submission already moved the deal out of
    -- DRAF. Return empty set; caller surfaces "already closed" error.
    return;
  end if;

  insert into deal_events (
    deal_id, actor, event, prior_hash, new_hash, ots_proof
  ) values (
    p_deal_id, 'COUNTERPART', 'COUNTERPART_JOINED', p_prior_hash, p_new_hash, null
  );

  return query select * from deals where id = p_deal_id;
end;
$$;

-- Lock down execution to service_role only.
-- Both functions are called exclusively via the service-role Supabase client in
-- Server Actions. Revoking from PUBLIC (which covers anon and authenticated)
-- prevents PostgREST from exposing them to unauthenticated callers who could
-- bypass application-layer controls (rate limit, attestation gate, self-join guard).
-- service_role is not a member of PUBLIC and retains execute access.
revoke execute on function create_deal_with_event(uuid, text, text, uuid, text, text, bigint, text, text, date, text) from public;
revoke execute on function join_deal_with_event(uuid, uuid, text, text) from public;
