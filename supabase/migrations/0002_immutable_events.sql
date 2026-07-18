-- deal_events must be append-only.
-- Allow UPDATE only when solely ots_proof is changing (filling a null after OTS confirmation).
-- Block all DELETEs and all other UPDATEs unconditionally.

create or replace function deal_events_guard()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'deal_events rows cannot be deleted';
  end if;

  -- UPDATE: permit only if the integrity fields are unchanged and only ots_proof differs
  if (
    new.id            = old.id            and
    new.deal_id       = old.deal_id       and
    new.actor         = old.actor         and
    new.event         = old.event         and
    new.prior_hash    is not distinct from old.prior_hash and
    new.new_hash      = old.new_hash      and
    new.created_at    = old.created_at
    -- ots_proof is the only column that may change
  ) then
    return new;
  end if;

  raise exception 'deal_events integrity fields are immutable';
end;
$$;

create trigger deal_events_immutable
  before update or delete on deal_events
  for each row execute function deal_events_guard();

-- Belt-and-suspenders: revoke direct UPDATE/DELETE from app roles.
-- Service role bypasses RLS but NOT triggers, so the guard above still applies.
revoke update, delete on deal_events from anon;
revoke update, delete on deal_events from authenticated;
