-- Build step 4, second entry point — the "ghost seller" case: Pembeli
-- already uploaded bukti (DIBAYAR_DIKLAIM), the deadline has passed, and
-- Penjual never confirmed receipt at all. This is the primary breach path
-- (data-model.md's rung 0: bukti claimed by pelapor, never confirmed by
-- terlapor) and was the one gap left by migration 0020, which only wired
-- the post-receipt-confirmed "barang tidak sesuai" path (DIKONFIRMASI_TERIMA
-- -> TIDAK_DIPENUHI, rung 1). Migration 0018's header comment already
-- anticipated this: "TENGGAT_LEWAT can only ever fire as a side effect of an
-- actual filed report, for BOTH DIBAYAR_DIKLAIM and DIKONFIRMASI_TERIMA."
--
-- Kept as its own function rather than a parameterized generalization of
-- 0020's file_barang_tidak_sesuai_with_event: the two entry states differ in
-- what's unconditionally true at filing time (rung 0 here vs rung 1 there),
-- matching this codebase's existing style of one function per concrete
-- transition rather than a generic multi-purpose RPC (see
-- submit_bukti_with_event / confirm_receipt_with_event / confirm_
-- fulfillment_with_event). Same atomic row-lock + prior-hash-recheck
-- pattern as every other transition RPC (0011/0015/0018/0020).
--
-- No sweep changes needed: get_kedaluwarsa_candidates and get_nudge_
-- candidates both filter on status IN (DIBAYAR_DIKLAIM, DIKONFIRMASI_TERIMA)
-- with no-flags-row / no-NUDGE_SENT guards respectively — the moment this
-- function moves a deal to TIDAK_DIPENUHI, it naturally falls out of both
-- candidate queries. The handshake documented in 0018 already covers this.

create or replace function file_deadline_lapse_with_event(
  p_deal_id         uuid,
  p_actor           text,
  p_field_note      text,
  p_field_note_hash text,
  p_identifiers     jsonb,
  p_prior_hash      text,
  p_new_hash        text
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
  set status = 'TIDAK_DIPENUHI'
  where id = p_deal_id
    and status = 'DIBAYAR_DIKLAIM';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, 'TENGGAT_LEWAT',
    jsonb_build_object('field_note_hash', p_field_note_hash),
    p_prior_hash, p_new_hash, null
  );

  -- rung fixed at 0 (not a caller-supplied parameter, unlike 0020's
  -- p_rung): DIBAYAR_DIKLAIM means RECEIPT_CONFIRMED has never fired for
  -- this deal, so data-model.md's rung rule ("bukti confirmed by
  -- counterpart earlier? rung 1 : rung 0") resolves to 0 unconditionally
  -- here, the mirror of file_barang_tidak_sesuai_with_event's rung-1 case.
  insert into flags (deal_id, rung, identifiers, hak_jawab_status, published_at)
  values (p_deal_id, 0, p_identifiers, 'MENUNGGU', null);

  -- field_note is optional for this entry point (the claim itself is
  -- system-derivable: deadline passed, no receipt confirmation), unlike C6
  -- where the reporter must describe which part of the description wasn't
  -- met. coalesce guards breach_notes.field_note's NOT NULL constraint.
  insert into breach_notes (deal_id, field_note)
  values (p_deal_id, coalesce(p_field_note, ''));

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function file_deadline_lapse_with_event(uuid, text, text, text, jsonb, text, text) from public;
grant execute on function file_deadline_lapse_with_event(uuid, text, text, text, jsonb, text, text) to service_role;
