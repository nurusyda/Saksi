-- ============================================================
-- 0037 — grant execute on create_deal_with_event to service_role
--
-- Migration 0036 dropped the old 11-param overload and created
-- the new 16-param one with the QRIS columns, then revoked
-- execute from public — but it never granted it back to
-- service_role. The equivalent grant was missing from the
-- original 0004 definition too (the same gap migration 0026
-- fixed for join_deal_with_event), but 0036's explicit
-- DROP + recreate finally closed the window: with no grant at
-- all, nobody (not even service_role, which PostgREST uses
-- when the server-side client is armed with the service-role
-- key) can call the function, so deal creation breaks
-- entirely.
-- ============================================================

grant execute on function create_deal_with_event(
  uuid,      -- p_id
  text,      -- p_token
  text,      -- p_tier
  uuid,      -- p_proposer_id
  text,      -- p_proposer_role
  text,      -- p_item_desc
  bigint,    -- p_amount_idr
  text,      -- p_rekening_tujuan
  text,      -- p_rekening_bank
  date,      -- p_deadline
  text,      -- p_new_hash
  text,      -- p_payment_method
  text,      -- p_qris_nmid
  text,      -- p_qris_merchant_name
  text,      -- p_qris_merchant_city
  text       -- p_qris_image_path
) to service_role;
