-- Phase 6 follow-up: 0018's functions never received the implicit
-- service_role EXECUTE grant that earlier atomic-write RPCs (0004, 0008,
-- 0011, 0013, 0015) got for free, because this project's Supabase instance
-- runs under the new cloud default (auto_expose_new_tables unset in
-- config.toml = new entities are NOT auto-exposed to Data API roles without
-- explicit GRANTs). Confirmed by direct RPC test: get_nudge_candidates
-- returned 42501 even for the service_role key, not just anon.
--
-- The cron route (app/api/cron/deadline-sweep) calls these 4 functions with
-- the service-role client exclusively, gated by CRON_SECRET. Grant execute
-- to service_role ONLY -- anon/authenticated stay revoked (0018's
-- `revoke ... from public`), since these RPCs bypass rate-limit,
-- attestation, and hash-chain-ordering checks that only the application
-- layer enforces. Signatures match 0018 exactly.
grant execute on function get_nudge_candidates(date)                      to service_role;
grant execute on function get_kedaluwarsa_candidates(date)                to service_role;
grant execute on function sweep_nudge_with_event(uuid, text, text)        to service_role;
grant execute on function sweep_kedaluwarsa_with_event(uuid, text, text)  to service_role;
