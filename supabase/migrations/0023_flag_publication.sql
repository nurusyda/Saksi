-- Build step 4, final phase — publication. The highest-stakes migration in
-- the product: this is what actually sets flags.published_at and makes a
-- record about a real person's phone/rekening publicly readable (the
-- `flags` table's existing "using (published_at is not null)" policy from
-- migration 0001 has been dormant until now — nothing has ever set that
-- column). All calls into this migration's RPCs are gated application-side
-- behind FLAGS_PUBLICATION_ENABLED (app/api/cron/deadline-sweep/route.ts) —
-- pending lawyer review per the standing GATE 1 requirement. The RPCs
-- themselves have no awareness of that flag; the gate lives entirely in the
-- sweep, same posture as every other feature-flag-style gate in this app
-- (e.g. pinjam-meminjam being gated off at the createDeal layer, not here).
--
-- Single T+14-day-from-filing checkpoint (2026-07-20 decision, see
-- lib/db/transitions.ts's SENGKETA_KADALUARSA comment for the full
-- reasoning): NOT two sequential silence windows. At T+14 from the
-- originating TENGGAT_LEWAT event, exactly one of two things is true and
-- stays true permanently once published:
--   - hak_jawab_status still MENUNGGU (nobody ever responded) -> publish
--     with the tier template's default "tidak merespons" wording.
--   - hak_jawab_status DISPUTED (a response was filed, at any point within
--     the 14 days) -> publish with the DISPUTED wording, permanently. No
--     second silence check.

-- ============================================================
-- get_flag_publish_candidates — both branches share the identical time
-- gate (T+14 days from the deal's TENGGAT_LEWAT event), so one candidate
-- query serves both; the caller (deadline-sweep route) branches on each
-- candidate's flags.hak_jawab_status to decide which of the two atomic
-- write RPCs below to call, the same "setof deals, caller does one more
-- targeted lookup" shape get_nudge_candidates/get_kedaluwarsa_candidates
-- already use for prior_hash.
-- ============================================================

create or replace function get_flag_publish_candidates(p_now timestamptz)
returns setof deals
language sql
stable
as $$
  select d.*
  from deals d
  join flags f on f.deal_id = d.id
  where f.published_at is null
    and (
      (d.status = 'TIDAK_DIPENUHI' and f.hak_jawab_status = 'MENUNGGU')
      or (d.status = 'SENGKETA' and f.hak_jawab_status = 'DISPUTED')
    )
    and exists (
      select 1 from deal_events e
      where e.deal_id = d.id
        and e.event = 'TENGGAT_LEWAT'
        and e.created_at <= p_now - interval '14 days'
    );
$$;

revoke execute on function get_flag_publish_candidates(timestamptz) from public;

-- ============================================================
-- publish_flag_silent_with_event — the MENUNGGU branch. Self-transition on
-- TIDAK_DIPENUHI (no deals.status UPDATE available to serve as the primary
-- guard, unlike the disputed branch below), so the status check is an
-- explicit `if not exists`, same idiom as sweep_nudge_with_event
-- (migration 0018) uses for the same reason.
-- ============================================================

create or replace function publish_flag_silent_with_event(
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
    return; -- stale prior_hash; caller retries
  end if;

  if not exists (
    select 1 from deals where id = p_deal_id and status = 'TIDAK_DIPENUHI'
  ) then
    return;
  end if;

  -- Primary write-gate: matches 0 rows if this flag was already published
  -- (lost a race with itself in an overlapping sweep run) or somehow isn't
  -- MENUNGGU anymore.
  update flags
  set published_at = now(), hak_jawab_status = 'KADALUARSA'
  where deal_id = p_deal_id
    and published_at is null
    and hak_jawab_status = 'MENUNGGU';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'FLAG_PUBLISHED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

-- ============================================================
-- publish_flag_disputed_with_event — the DISPUTED branch. Fires
-- SENGKETA_KADALUARSA (SENGKETA -> TIDAK_DIPENUHI), which doubles as both
-- "the dispute window has formally closed" and "this flag is now
-- published" — no separate publication event needed here, unlike the
-- silent branch, since this one already has a real status transition to
-- carry it. p_has_evidence is looked up by the caller from the
-- HAK_JAWAB_FILED event's payload and snapshotted into flags.identifiers
-- here (same "public-read cache derived from deal_events at write time"
-- pattern flags.identifiers already uses for rekening_masked/bank/
-- phone_hash — deal_events stays the source of truth, this is a read-path
-- optimization, not a second one).
-- ============================================================

create or replace function publish_flag_disputed_with_event(
  p_deal_id      uuid,
  p_has_evidence boolean,
  p_prior_hash   text,
  p_new_hash     text
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
  set status = 'TIDAK_DIPENUHI'
  where id = p_deal_id
    and status = 'SENGKETA';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'SENGKETA_KADALUARSA', p_prior_hash, p_new_hash, null);

  update flags
  set published_at = now(),
      identifiers = identifiers || jsonb_build_object('has_evidence', p_has_evidence)
  where deal_id = p_deal_id;

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function publish_flag_silent_with_event(uuid, text, text) from public;
revoke execute on function publish_flag_disputed_with_event(uuid, boolean, text, text) from public;

grant execute on function get_flag_publish_candidates(timestamptz) to service_role;
grant execute on function publish_flag_silent_with_event(uuid, text, text) to service_role;
grant execute on function publish_flag_disputed_with_event(uuid, boolean, text, text) to service_role;
