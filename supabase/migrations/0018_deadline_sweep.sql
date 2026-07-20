-- Phase 6 — deadline sweep. Decision tree confirmed 2026-07-20, corrected
-- same day after review (an earlier version of this migration had
-- DIKONFIRMASI_TERIMA's TENGGAT_LEWAT firing automatically on a timer —
-- wrong. Verified against content/legal/syarat-ketentuan.md SS4.1: "pihak
-- yang dirugikan *dapat* mengajukan laporan" (the wronged party *may* file
-- a report — optional, never automatic). TENGGAT_LEWAT can only ever fire
-- as a side effect of an actual filed report, for BOTH DIBAYAR_DIKLAIM and
-- DIKONFIRMASI_TERIMA. That reporting flow doesn't exist yet (Section C6 is
-- a stub), so this sweep never fires TENGGAT_LEWAT at all, for either
-- state — that wiring belongs entirely to the future report-filing RPC.
--
-- Two branches, one unified cron entry (see app/api/cron/deadline-sweep):
--   1. Nudge: deadline lapsed 2+ days ago (T+2), never nudged, either state.
--      Targets exactly one party per state (whichever is expected to act
--      next), not both — see the route handler for the payeeSlot/payerSlot
--      mapping, jual-beli only.
--   2. KEDALUWARSA_LAPSED: deadline 30+ days past, no flags row ever
--      created (nobody ever filed a report), from either DIBAYAR_DIKLAIM or
--      DIKONFIRMASI_TERIMA — a single quiet, no-blame terminal outcome,
--      same target status/event regardless of source state. The two source
--      states stay distinguishable in deal_events (whether RECEIPT_CONFIRMED
--      precedes this event), so nothing is lost by not splitting the status.
--
-- Both candidate-query functions take an explicit p_today_wib parameter
-- rather than using Postgres's current_date — found by monster_check: the
-- session timezone (UTC by default on Supabase) doesn't match deadline's
-- WIB semantics, which would silently shift T+2/30-day firing by up to a
-- day. See each function's own comment below.

-- ============================================================
-- Candidate queries
-- ============================================================

-- p_today_wib is computed in TypeScript (lib/format.ts's getTodayWib(), the
-- same WIB-offset formula SESSION_LOG.md documents already fixing this exact
-- bug class once for app/buat/actions.ts's deadline validation) and passed
-- in explicitly — found by monster_check: current_date resolves in whatever
-- timezone the Postgres session happens to be in (Supabase default is UTC),
-- but deals.deadline is a naive `date` column entered and validated as a
-- WIB calendar date. Comparing it against Postgres's current_date directly
-- reintroduces the same off-by-one-day bug, just in SQL instead of TS.

create or replace function get_nudge_candidates(p_today_wib date)
returns setof deals
language sql
stable
as $$
  select d.*
  from deals d
  where d.status in ('DIBAYAR_DIKLAIM', 'DIKONFIRMASI_TERIMA')
    and d.deadline <= p_today_wib - interval '2 days'
    and not exists (
      select 1 from deal_events e
      where e.deal_id = d.id and e.event = 'NUDGE_SENT'
    );
$$;

create or replace function get_kedaluwarsa_candidates(p_today_wib date)
returns setof deals
language sql
stable
as $$
  select d.*
  from deals d
  where d.status in ('DIBAYAR_DIKLAIM', 'DIKONFIRMASI_TERIMA')
    and d.deadline <= p_today_wib - interval '30 days'
    and not exists (
      select 1 from flags f where f.deal_id = d.id
    );
$$;

revoke execute on function get_nudge_candidates(date) from public;
revoke execute on function get_kedaluwarsa_candidates(date) from public;

-- ============================================================
-- Atomic write RPCs — same row-lock + prior-hash-recheck pattern as
-- 0011/0015 (submit_bukti_with_event, confirm_receipt_with_event, etc.).
-- ============================================================

create or replace function sweep_nudge_with_event(
  p_deal_id    uuid,
  p_prior_hash text,
  p_new_hash   text
)
returns setof deals
language plpgsql
as $$
declare
  v_actual_prior_hash text;
begin
  perform 1 from deals where id = p_deal_id for update;

  select new_hash into v_actual_prior_hash
  from deal_events
  where deal_id = p_deal_id
  order by id desc
  limit 1;

  if v_actual_prior_hash is distinct from p_prior_hash then
    return; -- stale prior_hash; caller re-fetches and retries next sweep run
  end if;

  -- Status guard: found by monster_check. sweep_kedaluwarsa_with_event gets
  -- this for free via its UPDATE ... WHERE status = 'X' clause; this one is
  -- a pure self-transition (no UPDATE at all), so without an explicit check
  -- a deal that the kedaluwarsa branch already moved to KEDALUWARSA since
  -- candidate selection would still get a NUDGE_SENT event inserted — an
  -- event with no valid VALID_TRANSITIONS entry from that status.
  if not exists (
    select 1 from deals
    where id = p_deal_id and status in ('DIBAYAR_DIKLAIM', 'DIKONFIRMASI_TERIMA')
  ) then
    return;
  end if;

  -- Idempotency guard duplicated here (not just in get_nudge_candidates):
  -- closes the window between candidate selection and this write within the
  -- same sweep invocation.
  if exists (select 1 from deal_events where deal_id = p_deal_id and event = 'NUDGE_SENT') then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'NUDGE_SENT', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

create or replace function sweep_kedaluwarsa_with_event(
  p_deal_id    uuid,
  p_prior_hash text,
  p_new_hash   text
)
returns setof deals
language plpgsql
as $$
declare
  v_actual_prior_hash text;
begin
  perform 1 from deals where id = p_deal_id for update;

  select new_hash into v_actual_prior_hash
  from deal_events
  where deal_id = p_deal_id
  order by id desc
  limit 1;

  if v_actual_prior_hash is distinct from p_prior_hash then
    return;
  end if;

  update deals
  set status = 'KEDALUWARSA'
  where id = p_deal_id
    and status in ('DIBAYAR_DIKLAIM', 'DIKONFIRMASI_TERIMA');

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'KEDALUWARSA_LAPSED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function sweep_nudge_with_event(uuid, text, text) from public;
revoke execute on function sweep_kedaluwarsa_with_event(uuid, text, text) from public;
