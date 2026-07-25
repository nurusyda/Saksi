-- ============================================================
-- 0038 — fix QRIS CHECK constraint: accept qris_merchant_name
--        instead of qris_nmid as the required payment destination
--
-- Migration 0036's deals_payment_destination_set_after_draf
-- required qris_nmid IS NOT NULL for QRIS deals to leave DRAF.
-- But findQrisMerchantId() in lib/qris/decode.ts is explicitly
-- best-effort — NMID sub-tag position varies across PJSP/acquirer
-- implementations, so a QR code that decodes correctly with a
-- legible merchant name can still have a null NMID.
--
-- createDeal enforces qris_merchant_name IS NOT NULL at creation,
-- so the merchant name is the reliable identifier. The NMID is a
-- bonus for the forced-check/ledger features when available; its
-- absence means those features return empty (the weaker true
-- claim) rather than blocking the deal entirely.
--
-- Two live deals (both "Muthia Haris Nurusyda") were stuck in
-- DRAF because of this — they have qris_merchant_name set but
-- qris_nmid null, so the old constraint rejected the join.
-- ============================================================

alter table deals drop constraint if exists deals_payment_destination_set_after_draf;

alter table deals add constraint deals_payment_destination_set_after_draf
  check (
    status = 'DRAF'
    or (payment_method = 'REKENING' and rekening_tujuan is not null and rekening_bank is not null)
    or (payment_method = 'QRIS' and qris_merchant_name is not null)
  );
