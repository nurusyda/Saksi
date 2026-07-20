-- Fix: migration 0027 created deal_status_poll_attempts with RLS + a
-- service_role policy but no table-level GRANT, so service_role hit
-- "permission denied for table deal_status_poll_attempts" on every poll
-- (caught 2026-07-21 via Vercel logs — WaitingStatusPoll.tsx's getDealStatus
-- silently failed rate-limit bookkeeping on every call, though it didn't
-- block the poll itself). Same omission class as 0025/0026
-- (join_deal_with_event). 0027's file is corrected in the same pass, but
-- since 0027 had already been applied to the remote database, this separate
-- migration backfills the grant that should have been part of it.
grant select, insert on deal_status_poll_attempts to service_role;
