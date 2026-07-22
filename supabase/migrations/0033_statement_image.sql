-- ============================================================
-- 0033 — optional supporting image on a deal statement
--
-- §45 follow-up: images on both sides of every dispute. Until now a
-- deal_statement (the penjual's "dana belum masuk", the pembeli's "barang
-- tidak sesuai", the penjual's answer) was text only. A buyer saying "I paid
-- for an iPhone 11 and an iPhone 6 arrived" and a seller answering "the money
-- never landed" both want to show a photo/screenshot, exactly like the payment
-- bukti already can.
--
-- Evidentiary tier matches bukti deliberately: the image lives in the private
-- 'bukti' storage bucket (0014), referenced by storage path on the RLS-locked
-- statement row, shown later only via a short-lived signed URL. It is NOT
-- hash-chained — the BUKTI_UPLOADED event carries a null payload too, so the
-- payment bukti isn't chained either, and giving statement images a stronger
-- guarantee than the payment bukti would be an inconsistent claim. The event
-- payload stays exactly `{ body_hash }`; the canonical hash format is
-- untouched. The image is supporting evidence, shown attributed and never
-- vouched for ("asli" is never claimed), same as every other artifact here.
--
-- Column is nullable: a text-only statement remains valid, so an image is
-- offered, never required.
-- ============================================================

alter table deal_statements add column if not exists image_path text;

-- ============================================================
-- record_deal_statement_with_event — regains one trailing, defaulted param
-- (p_image_path) so it can persist the optional image path in the same
-- transaction as the event + statement rows. Everything else is identical to
-- 0032. Recreated (drop + create) rather than overloaded: the arg list changes
-- and one resolvable function is safer than two overloads PostgREST must
-- disambiguate. p_image_path defaults to null so the existing 9-argument call
-- sites (which send no image) resolve to this function unchanged.
-- ============================================================

drop function if exists record_deal_statement_with_event(uuid, text, text, text, text, text, text, text, text);

create or replace function record_deal_statement_with_event(
  p_deal_id        uuid,
  p_actor          text,
  p_kind           text,
  p_body           text,
  p_body_hash      text,
  p_required_status text,
  p_event          text,
  p_prior_hash     text,
  p_new_hash       text,
  p_image_path     text default null
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

  insert into deal_statements (deal_id, actor, kind, body, image_path)
  values (p_deal_id, p_actor, p_kind, p_body, p_image_path);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function record_deal_statement_with_event(uuid, text, text, text, text, text, text, text, text, text) from public;
grant  execute on function record_deal_statement_with_event(uuid, text, text, text, text, text, text, text, text, text) to service_role;
