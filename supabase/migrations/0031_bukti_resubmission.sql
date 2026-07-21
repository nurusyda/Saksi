-- ============================================================
-- 0031 — resubmit_bukti_with_event: let the payer answer a payment dispute
--
-- Migration 0029 gave the penjual a way to say "dana belum masuk / bukti
-- salah" and put that statement on the record. It gave the pembeli no way to
-- answer it. The disagreement could be stated once and then sat there until
-- the deadline lapsed — which is the wrong shape for the most common real
-- cause of this dispute, which is not fraud but a mistake: the wrong
-- screenshot attached, a transfer to an old account, a payment that really
-- was still in flight.
--
-- So: the pembeli can upload a corrected bukti while the deal is in
-- DIBAYAR_DIKLAIM, and the penjual can then confirm it or say so again. The
-- loop is bounded at two rounds (enforced in TypeScript, see
-- app/deal/[token]/paymentActions.ts) — long enough to clear an honest
-- mistake, short enough that it cannot become an endless back-and-forth.
--
-- `submit_bukti_with_event` (0015) cannot be reused: its UPDATE is guarded
-- on `status = 'DISEPAKATI'`, so it is a no-op from DIBAYAR_DIKLAIM and
-- returns zero rows, which the caller reads as a lost race. This is the same
-- function shape with the guard moved to the state a re-upload actually
-- happens in, and no UPDATE at all — the status is already DIBAYAR_DIKLAIM
-- and stays there. Pure self-transition, so the explicit status check below
-- is the only gate (same reasoning as sweep_nudge_with_event in 0018 and
-- record_dana_belum_masuk_with_event in 0029).
--
-- Every bukti is INSERTed, never updated: the earlier one stays on the
-- record. A reader must be able to see that the first bukti was disputed and
-- what replaced it, not just the version that finally stuck. `bukti` has no
-- unique constraint on deal_id, so multiple TRANSFER rows per deal are
-- already representable; getBuktiForDisplay orders by created_at desc and so
-- shows the newest.
-- ============================================================

create or replace function resubmit_bukti_with_event(
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

  if not exists (
    select 1 from deals where id = p_deal_id and status = 'DIBAYAR_DIKLAIM'
  ) then
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

revoke execute on function resubmit_bukti_with_event(uuid, uuid, text, text, boolean, jsonb, text, text, text, text) from public;
grant  execute on function resubmit_bukti_with_event(uuid, uuid, text, text, boolean, jsonb, text, text, text, text) to service_role;
