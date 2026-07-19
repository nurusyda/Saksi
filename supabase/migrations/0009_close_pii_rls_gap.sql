-- Close a PII exposure present since 0001: both "public read non-pii ___
-- columns" policies were named for column-level restriction but RLS policies
-- can only restrict rows, never columns. anon/authenticated can currently
-- SELECT the full deals row (including unmasked rekening_tujuan) and the full
-- parties row (including phone_e164, the raw phone number) directly via
-- Supabase's public REST API, bypassing deals_public/parties_public's masking
-- entirely. Public reads must only ever go through those views.
--
-- Revoking table-level SELECT is safe: no app code queries `deals` or
-- `parties` with the anon/authenticated client today (lib/supabase/client.ts
-- is confirmed unused — every read in the app goes through the service-role
-- client, which bypasses RLS regardless of these grants either way). Views
-- run with their owner's privileges by default (no security_invoker set on
-- either view), so deals_public/parties_public keep working unaffected.
--
-- The old policies are dropped, not just left dormant behind the revoke: if
-- SELECT is ever re-granted to these roles in the future without a new
-- policy being written, RLS defaults to deny-all (safe) rather than silently
-- reactivating the too-broad "using (true)" / "status != 'DRAF'" access.

revoke select on deals from anon, authenticated;
revoke select on parties from anon, authenticated;

drop policy if exists "public read non-pii deal columns" on deals;
drop policy if exists "public read non-pii party columns" on parties;
