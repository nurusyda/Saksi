-- ============================================================
-- 0030 — backfill missing service_role table GRANTs
--
-- Found 2026-07-21 by probing the live database directly with the service
-- role key: SELECT on six tables returned `42501 permission denied`.
--
-- Root cause is the same omission 0028 already fixed once for
-- deal_status_poll_attempts: a table gets `enable row level security` plus a
-- `for all to service_role` POLICY, and that reads like it grants access —
-- but an RLS policy only decides which ROWS are visible once a role already
-- has table-level privileges. Without a GRANT there are no privileges for
-- the policy to filter, so every statement fails outright. The tables
-- created in 0001 (parties/deals/deal_events/bukti/feature_interest) were
-- granted at project setup and masked the problem; every table added by a
-- later migration inherited nothing.
--
-- Impact, stated plainly: the entire breach → flag pipeline has never worked
-- against this database. `flags`, `breach_notes` and `hak_jawab_evidence`
-- are the storage for filing a report, for the 14-day hak jawab response,
-- and for its evidence attachment. All three were unreachable, so
-- fileBarangTidakSesuaiReport / fileDeadlineLapseReport / respondHakJawab
-- have been failing with ERROR_REPORT_FILE_FAILED since migration 0020
-- shipped. This was not caught earlier because the OTP gate sat in front of
-- those actions and nobody had completed a report end-to-end against prod.
-- `lookup_attempts` (the /cek rate limiter) and `deal_statements` (0029's
-- new table, same omission repeated) are the other two.
--
-- Privileges are scoped to what the code actually does, not blanket ALL:
--   flags               select (accountHistory, ledger, sweep) + insert (file
--                       report) + update (hak_jawab_status, published_at)
--   breach_notes        select (getBreachReportNote/getHakJawabResponse)
--                       + insert (file report) + update (response_note)
--   hak_jawab_evidence  select (signed-URL lookup) + insert (0022's RPC)
--   lookup_attempts     select (count in window) + insert (record attempt)
--   deal_statements     select (getDealStatements) + insert (0029's RPC)
--
-- Deliberately NOT granted: otp_codes and otp_send_attempts. Both are also
-- denied, and both are now vestigial — the OTP flow was removed in §25 and
-- nothing reads or writes them. Granting access to tables no code touches
-- would widen the surface for no reason. They are left in place (dropping is
-- irreversible) and left ungranted.
--
-- No RLS policy changes: every one of these already has the correct
-- service-role policy. This migration only adds the table-level privileges
-- those policies were always assuming.
-- ============================================================

grant select, insert, update on flags              to service_role;
grant select, insert, update on breach_notes       to service_role;
grant select, insert         on hak_jawab_evidence to service_role;
grant select, insert         on lookup_attempts    to service_role;
grant select, insert         on deal_statements    to service_role;
