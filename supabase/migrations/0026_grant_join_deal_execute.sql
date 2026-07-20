-- Fix: migration 0025 dropped and re-created join_deal_with_event with the
-- standard revoke-from-public line, but the matching grant-to-service_role
-- line was accidentally omitted (caught 2026-07-20 when counterpart join
-- failed with ERROR_JOIN_FAILED — the RPC was unreachable by any role).
-- 0025's file was corrected in the same commit, but since 0025 had already
-- been applied to the remote database, this separate migration backfills the
-- grant that should have been part of it.
grant execute on function join_deal_with_event(uuid, uuid, text, text, text, text, text, text) to service_role;
