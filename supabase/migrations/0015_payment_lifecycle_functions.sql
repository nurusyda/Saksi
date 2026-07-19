-- Atomic write functions for DISEPAKATI -> DIBAYAR_DIKLAIM ->
-- DIKONFIRMASI_TERIMA -> SELESAI (Section C, C3-C5). Same pattern as
-- 0004/0011: row lock + prior_hash re-check under the lock (0011's race fix,
-- applied here from the start rather than as a follow-up), one UPDATE + one
-- INSERT per transition in a single transaction, SECURITY INVOKER, service
-- role only.

create or replace function submit_bukti_with_event(
  p_bukti_id     uuid,
  p_deal_id      uuid,
  p_uploader     text,
  p_storage_path text,
  p_attested     boolean,
  p_ocr_result   jsonb,
  p_ocr_verdict  text,
  p_actor        text,
  p_prior_hash   text,
  p_new_hash     text
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
  set status = 'DIBAYAR_DIKLAIM'
  where id = p_deal_id
    and status = 'DISEPAKATI';

  if not found then
    return;
  end if;

  insert into bukti (
    id, deal_id, uploader, kind, storage_path, ocr_result, ocr_verdict, attested
  ) values (
    p_bukti_id, p_deal_id, p_uploader, 'TRANSFER', p_storage_path, p_ocr_result, p_ocr_verdict, p_attested
  );

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'BUKTI_UPLOADED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

create or replace function confirm_receipt_with_event(
  p_deal_id    uuid,
  p_actor      text,
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
    return;
  end if;

  update deals
  set status = 'DIKONFIRMASI_TERIMA'
  where id = p_deal_id
    and status = 'DIBAYAR_DIKLAIM';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'RECEIPT_CONFIRMED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

create or replace function confirm_fulfillment_with_event(
  p_deal_id    uuid,
  p_actor      text,
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
    return;
  end if;

  update deals
  set status = 'SELESAI'
  where id = p_deal_id
    and status = 'DIKONFIRMASI_TERIMA';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'FULFILLMENT_CONFIRMED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function submit_bukti_with_event(uuid, uuid, text, text, boolean, jsonb, text, text, text, text) from public;
revoke execute on function confirm_receipt_with_event(uuid, text, text, text) from public;
revoke execute on function confirm_fulfillment_with_event(uuid, text, text, text) from public;
