-- ============================================================
-- 0041 — Make the 7-day DRAF auto-delete promise actually happen.
--
-- 0003's cleanup job (`delete from deals where status = 'DRAF' and
-- created_at < now() - interval '7 days'`) has never deleted a single row,
-- for two independent, structural reasons:
--   1. No FK referencing `deals` specifies ON DELETE CASCADE, and every
--      DRAF deal is guaranteed to have at least a CREATED deal_events row
--      (create_deal_with_event writes both in one transaction) — so the
--      bare DELETE always hits a foreign-key violation, and because a
--      DELETE is a single statement, that violation aborts the whole run.
--   2. deal_events_guard() (0002) unconditionally raises on DELETE. Adding
--      cascade alone would not fix this — the trigger fires on cascaded
--      deletes too.
--
-- Nothing monitors cron.job_run_details, so this has failed silently every
-- night since 0003. Two legal documents (syarat-ketentuan.md §3,
-- privasi-retensi.md) state the 7-day purge as a user right — "tidak ada
-- catatan yang tersisa" — which has not been true in practice.
--
-- Resolution (confirmed with the human, narrowest possible exception): a
-- DRAF deal with no counterpart was never witnessed by a second party — it
-- is not a record of an agreement, so deleting its lone CREATED event does
-- not touch the append-only guarantee's actual purpose (protecting
-- evidence of a witnessed transaction). The exception is scoped exactly
-- that narrowly — status = DRAF and counterpart_id is null — and the guard
-- re-checks that condition itself against the live deals row rather than
-- trusting the caller.
-- ============================================================

-- ---- deal_events_guard(): add the narrow DRAF-purge exception ----

create or replace function deal_events_guard()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    if current_setting('saksi.allow_draf_purge', true) = 'on'
       and exists (
         select 1 from deals d
         where d.id = old.deal_id
           and d.status = 'DRAF'
           and d.counterpart_id is null
       )
    then
      return old;
    end if;
    raise exception 'deal_events rows cannot be deleted';
  end if;

  -- UPDATE: unchanged from 0040 — integrity fields (including payload) are
  -- immutable, only ots_proof may change.
  if (
    new.id            = old.id            and
    new.deal_id       = old.deal_id       and
    new.actor         = old.actor         and
    new.event         = old.event         and
    new.payload       is not distinct from old.payload and
    new.prior_hash    is not distinct from old.prior_hash and
    new.new_hash      = old.new_hash      and
    new.created_at    = old.created_at
  ) then
    return new;
  end if;

  raise exception 'deal_events integrity fields are immutable';
end;
$$;

-- ---- cleanup_draf_deals(): replaces the bare DELETE the cron calls ----
-- security definer so it can set the session-local flag the guard checks;
-- revoked from every PostgREST-reachable role below — this is a cron-only
-- entry point, never callable over the API.
--
-- Every FK referencing `deals` is deleted from explicitly, enumerated by
-- reading every migration rather than assumed (see the review that found
-- this bug) — most of these are structurally always empty for a still-DRAF
-- deal (bukti/flags/breach-pipeline tables all start downstream of
-- DISEPAKATI), included anyway so a future migration adding rows earlier in
-- the lifecycle doesn't silently reintroduce the abort this migration
-- exists to fix.
--
-- Each qualifying deal is cleaned in its own sub-transaction (a nested
-- block, not a savepoint-free loop): if one deal races out of DRAF between
-- the initial SELECT and its turn (e.g. the counterpart joins mid-run), the
-- guard correctly refuses that one deal's deal_events delete — and this
-- catches that instead of letting it abort the entire nightly run the way
-- 0003's single-statement DELETE always did.

create or replace function cleanup_draf_deals()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal record;
  v_purged int := 0;
  v_skipped int := 0;
begin
  for v_deal in
    select id, proposer_id from deals
    where status = 'DRAF'
      and counterpart_id is null
      and created_at < now() - interval '7 days'
  loop
    begin
      delete from deal_status_poll_attempts where deal_id = v_deal.id;
      delete from identify_attempts         where deal_id = v_deal.id;
      delete from otp_codes                 where deal_id = v_deal.id;
      delete from breach_notes              where deal_id = v_deal.id;
      delete from hak_jawab_evidence        where deal_id = v_deal.id;
      delete from report_evidence           where deal_id = v_deal.id;
      delete from deal_statements           where deal_id = v_deal.id;
      delete from bukti                     where deal_id = v_deal.id;
      delete from flags                     where deal_id = v_deal.id;

      perform set_config('saksi.allow_draf_purge', 'on', true); -- true = txn-local
      delete from deal_events where deal_id = v_deal.id;
      delete from deals       where id      = v_deal.id;
      perform set_config('saksi.allow_draf_purge', 'off', true);

      -- The proposer's own party row is the one trace of this deal that
      -- doesn't hang off deal_id — deals.proposer_id/counterpart_id are the
      -- only two FKs referencing parties in the whole schema, so once no
      -- deal references this party, nothing does.
      delete from parties p
      where p.id = v_deal.proposer_id
        and not exists (
          select 1 from deals d where d.proposer_id = p.id or d.counterpart_id = p.id
        );

      v_purged := v_purged + 1;
    exception when others then
      perform set_config('saksi.allow_draf_purge', 'off', true);
      v_skipped := v_skipped + 1;
      raise warning 'cleanup_draf_deals: skipped deal %: %', v_deal.id, sqlerrm;
    end;
  end loop;

  raise notice 'cleanup_draf_deals: purged % deal(s), skipped %', v_purged, v_skipped;
end;
$$;

-- service_role can already reach every table this function touches directly
-- (bypasses RLS), and the deal_events guard trigger fires regardless of
-- caller role — so granting EXECUTE here doesn't weaken anything, it just
-- lets ops call this function manually (debugging, or re-running a failed
-- night) the same way pg_cron's job does.
revoke execute on function cleanup_draf_deals() from public, anon, authenticated;
grant execute on function cleanup_draf_deals() to service_role;

-- ---- Point the existing cron job at the function instead of the bare
-- DELETE that has never once succeeded. cron.schedule() with a job name
-- that already exists updates that job's command in place — no separate
-- unschedule call needed. ----

create extension if not exists pg_cron;

select cron.schedule(
  'cleanup-draf-deals',
  '0 3 * * *',  -- 03:00 UTC daily, unchanged from 0003
  $$ select cleanup_draf_deals(); $$
);
