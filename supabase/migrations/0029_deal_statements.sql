-- ============================================================
-- 0029 — deal_statements + record_dana_belum_masuk_with_event
--
-- Replaces the WhatsApp side-effect that used to be the entire content of
-- the penjual's "Dana belum masuk / bukti salah" action.
--
-- What that action did before: no deal_events row, no status change, no
-- persisted anything. It fired a best-effort WA nudge at the payer and the
-- UI then reported whether Fonnte had accepted it. When the WA channel was
-- unavailable the buyer therefore learned nothing at all, and the seller was
-- shown a delivery-failure notice about an integration, which is not a fact
-- about their deal and not something they can act on.
--
-- What it does now: the seller states what actually happened in their own
-- words, and that statement is recorded. It becomes part of the deal's
-- history, it is hash-chained like every other event, and the buyer sees it
-- on their own status page. The record carries the disagreement instead of a
-- notification channel carrying it.
--
-- Deliberately a SELF-TRANSITION on DIBAYAR_DIKLAIM. This is not a breach
-- report and must not shortcut into the breach pipeline: no flags row, no
-- TIDAK_DIPENUHI, no publication. It is one party's account of events,
-- attributed to them, sitting alongside the buyer's bukti claim. Both sides
-- are now on the record and a reader can see they disagree — which is the
-- whole product. The breach path stays exactly where it was, gated on the
-- deadline actually lapsing.
--
-- Note text lives in its own RLS-locked table rather than in the (publicly
-- readable) deal_events.payload, and the event payload carries only a
-- SHA-256 of the text. Same split as breach_notes (0020): the hash chain
-- still witnesses the note's exact content without publishing the raw words.
-- ============================================================

create table deal_statements (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals (id),
  actor text not null check (actor in ('PROPOSER', 'COUNTERPART')),
  kind text not null check (kind in ('DANA_BELUM_MASUK')),
  body text not null,
  created_at timestamptz not null default now()
);

create index on deal_statements (deal_id);

alter table deal_statements enable row level security;

create policy "service role full access on deal_statements"
  on deal_statements for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- record_dana_belum_masuk_with_event
--
-- Same row-lock + prior-hash-recheck shape as every other atomic transition
-- RPC here (0004/0011/0015/0018/0020). Two writes in one transaction: the
-- DANA_BELUM_MASUK event (payload = note hash only) and the statement row.
--
-- No UPDATE on deals: the status is unchanged by design, so the explicit
-- status guard below is the only gate, exactly as in sweep_nudge_with_event
-- (0018) which has the same pure-self-transition shape and needed the same
-- guard for the same reason.
--
-- Not idempotency-guarded on its own event name, unlike NUDGE_SENT: a seller
-- may legitimately need to correct or add to their account of what happened
-- (a second transfer arrived, the first statement was wrong). Each statement
-- is appended and attributed; none replace or delete an earlier one, so the
-- record shows the sequence rather than only the latest claim.
-- ============================================================

create or replace function record_dana_belum_masuk_with_event(
  p_deal_id    uuid,
  p_actor      text,
  p_body       text,
  p_body_hash  text,
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
    select 1 from deals where id = p_deal_id and status = 'DIBAYAR_DIKLAIM'
  ) then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, 'DANA_BELUM_MASUK',
    jsonb_build_object('body_hash', p_body_hash),
    p_prior_hash, p_new_hash, null
  );

  insert into deal_statements (deal_id, actor, kind, body)
  values (p_deal_id, p_actor, 'DANA_BELUM_MASUK', p_body);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function record_dana_belum_masuk_with_event(uuid, text, text, text, text, text) from public;
grant execute on function record_dana_belum_masuk_with_event(uuid, text, text, text, text, text) to service_role;
