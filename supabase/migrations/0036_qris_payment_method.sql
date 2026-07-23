-- ============================================================
-- 0036 — QRIS as an alternate payment-destination type
--
-- A real seller reported QRIS as their only payment channel — no bank
-- account to type in. QRIS does not carry a bank account number at all (the
-- whole point of QRIS is that it abstracts the merchant's settlement account
-- behind a National Merchant ID assigned by their PJSP/acquirer), so this is
-- a second identity type living alongside rekening_tujuan/rekening_bank, not
-- a new way to capture the same data.
--
-- Scope (confirmed with the human before building): seller-chosen
-- alternative at deal creation, both paths stay supported; available from
-- GRATIS up, no tier gate.
--
-- payment_method is captured once, at CREATE (same point rekening_tujuan is
-- captured today — createDeal only accepts proposer_role='PENJUAL', so the
-- payee is always known and on record before DRAF ever leaves the seller's
-- hands; see migration 0025/§22). join_deal_with_event's rekening params are
-- dead code paths per that same change, so this migration does not touch it.
-- ============================================================

alter table deals add column payment_method text not null default 'REKENING'
  check (payment_method in ('REKENING', 'QRIS'));

alter table deals add column qris_nmid text;              -- National Merchant ID, from the decoded EMVCo payload
alter table deals add column qris_merchant_name text;      -- merchant name as registered with the PJSP/acquirer
alter table deals add column qris_merchant_city text;
alter table deals add column qris_image_path text;         -- private Storage path to the uploaded QRIS image (evidence)

-- Replaces the 0013 constraint (status=DRAF or rekening both set) with a
-- payment_method-aware version: a QRIS deal must have qris_nmid set instead
-- of rekening, before it can leave DRAF.
alter table deals drop constraint if exists deals_rekening_set_after_draf;

alter table deals add constraint deals_payment_destination_set_after_draf
  check (
    status = 'DRAF'
    or (payment_method = 'REKENING' and rekening_tujuan is not null and rekening_bank is not null)
    or (payment_method = 'QRIS' and qris_nmid is not null)
  );

-- create_deal_with_event: five new optional parameters, defaulted so every
-- existing call site (none yet migrated) keeps working unchanged. p_rekening_tujuan/
-- p_rekening_bank stay required-by-convention for REKENING deals, enforced by
-- the CHECK constraint above rather than by the function — same posture 0013
-- already established (nullability lives on the column/constraint, not the RPC).
drop function if exists create_deal_with_event(uuid, text, text, uuid, text, text, bigint, text, text, date, text);

create or replace function create_deal_with_event(
  p_id                  uuid,
  p_token               text,
  p_tier                text,
  p_proposer_id         uuid,
  p_proposer_role       text,
  p_item_desc           text,
  p_amount_idr          bigint,
  p_rekening_tujuan     text,
  p_rekening_bank       text,
  p_deadline            date,
  p_new_hash            text,
  p_payment_method      text default 'REKENING',
  p_qris_nmid           text default null,
  p_qris_merchant_name  text default null,
  p_qris_merchant_city  text default null,
  p_qris_image_path     text default null
)
returns setof deals
language plpgsql
as $$
begin
  insert into deals (
    id, token, tier, proposer_id, proposer_role,
    item_desc, amount_idr, rekening_tujuan, rekening_bank,
    deadline, status, meterai_applied,
    payment_method, qris_nmid, qris_merchant_name, qris_merchant_city, qris_image_path
  ) values (
    p_id, p_token, p_tier, p_proposer_id, p_proposer_role,
    p_item_desc, p_amount_idr, p_rekening_tujuan, p_rekening_bank,
    p_deadline, 'DRAF', false,
    p_payment_method, p_qris_nmid, p_qris_merchant_name, p_qris_merchant_city, p_qris_image_path
  );

  insert into deal_events (
    deal_id, actor, event, prior_hash, new_hash, ots_proof
  ) values (
    p_id, 'PROPOSER', 'CREATED', null, p_new_hash, null
  );

  return query select * from deals where id = p_id;
end;
$$;

revoke execute on function create_deal_with_event(
  uuid, text, text, uuid, text, text, bigint, text, text, date, text, text, text, text, text, text
) from public;

-- deals_public view: rebuilt to expose the QRIS fields alongside the existing
-- masked-rekening projection. qris_nmid/merchant name are not further masked
-- here — an NMID is a PJSP-assigned routing identifier, not a bank account
-- number, and the merchant name is the same public-facing name the QR code
-- itself displays to anyone who scans it; there is no unmasked-vs-masked
-- distinction to draw for either field the way there is for rekening_tujuan.
drop view if exists deals_public;

create view deals_public as
  select
    id,
    token,
    tier,
    proposer_id,
    counterpart_id,
    proposer_role,
    item_desc,
    amount_idr,
    regexp_replace(rekening_tujuan, '^(.{2})(.+)(.{2})$', '\1' || repeat('•', length(rekening_tujuan) - 4) || '\3') as rekening_tujuan_masked,
    rekening_bank,
    payment_method,
    qris_nmid,
    qris_merchant_name,
    qris_merchant_city,
    deadline,
    status,
    meterai_applied,
    created_at
  from deals
  where status != 'DRAF';
