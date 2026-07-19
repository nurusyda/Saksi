-- C1/C2 (Section C, 2026-07-19 batch): the create form asks for a
-- destination account regardless of proposer role today, which is wrong for
-- Pembeli-initiated deals — the buyer doesn't have a destination account to
-- offer; it's the seller's, and the seller isn't on record yet at DRAF time.
--
-- Fix: rekening_tujuan/rekening_bank become nullable, populated either at
-- CREATE (proposer = Penjual, as before) or at JOIN (proposer = Pembeli,
-- counterpart/Penjual supplies it — see join_deal_with_event below and
-- app/deal/[token]/JoinDealForm.tsx). Both must be set by the time a deal
-- leaves DRAF — enforced below, not just in application code.

alter table deals
  alter column rekening_tujuan drop not null,
  alter column rekening_bank drop not null;

alter table deals add constraint deals_rekening_set_after_draf
  check (status = 'DRAF' or (rekening_tujuan is not null and rekening_bank is not null));

-- create_deal_with_event (0004) needs no change: its p_rekening_tujuan/
-- p_rekening_bank parameters were never NOT NULL at the function level, only
-- the underlying columns were — dropping the column constraint above is
-- sufficient for Pembeli-initiated deals to pass null through unchanged.

-- join_deal_with_event: two new optional parameters. coalesce() makes this a
-- no-op for Penjual-initiated deals (params stay null, existing values
-- preserved); for Pembeli-initiated deals the joining Penjual's rekening is
-- written here, in the same atomic UPDATE that flips DRAF -> DIAJUKAN.
drop function if exists join_deal_with_event(uuid, uuid, text, text);

create or replace function join_deal_with_event(
  p_deal_id         uuid,
  p_counterpart_id  uuid,
  p_prior_hash      text,
  p_new_hash        text,
  p_rekening_tujuan text default null,
  p_rekening_bank   text default null
)
returns setof deals
language plpgsql
as $$
declare
  v_rows int;
begin
  update deals
  set counterpart_id  = p_counterpart_id,
      status          = 'DIAJUKAN',
      rekening_tujuan = coalesce(p_rekening_tujuan, rekening_tujuan),
      rekening_bank   = coalesce(p_rekening_bank, rekening_bank)
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

revoke execute on function join_deal_with_event(uuid, uuid, text, text, text, text) from public;
