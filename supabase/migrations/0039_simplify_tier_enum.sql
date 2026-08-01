-- 0039: Remove LIMA_RIBU and BERMETERAI from deals.tier CHECK constraint.
-- The old per-deal verification ladder (GRATIS / LIMA_RIBU Rp5.000 / BERMETERAI
-- Rp50.000) is superseded by seller-account tiers (Akun Saksi Rp20.000 one-time,
-- Toko Saksi Pro Rp200.000/year) and the per-deal Saksi Resmi e-meterai addon
-- (Rp30.000, buyer-initiated). The deals.tier column stays as a placeholder;
-- every deal is created as 'GRATIS' (standard, no per-deal tier).
--
-- Also removes the stale "Rp5rb+" reference from parties.phone_verified_at's
-- comment -- phone verification was a LIMA_RIBU-tier mechanic whose only
-- implementation (WA OTP) was removed in 0025.

-- 1. Drop the old CHECK constraint and re-add with only 'GRATIS'
alter table deals
  drop constraint if exists deals_tier_check;

alter table deals
  add constraint deals_tier_check check (tier in ('GRATIS'));

-- 2. Update the phone_verified_at comment
comment on column parties.phone_verified_at is
  'set by OTP success (breach filing or future identity verification)';
