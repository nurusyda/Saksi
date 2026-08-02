-- ============================================================
-- 0040 — Persist CREATED/COUNTERPART_JOINED event payloads; close two
-- hash-chain integrity gaps found by a full-repo review.
--
-- Gap 1: create_deal_with_event and join_deal_with_event hash a non-null
-- payload ({tnc_version, tnc_hash}) client-side (app/buat/actions.ts,
-- app/deal/[token]/actions.ts) but never store it in deal_events.payload.
-- An independent verifier cannot reproduce the CREATED/COUNTERPART_JOINED
-- hash from the database alone — the whole point of the hash chain — and
-- has to brute-force every git revision of the T&C file instead (see
-- analysis/verify-hash-chain.ts's collectTncPayloads, now removable).
-- Fix: both RPCs take a new payload parameter and store it.
--
-- Gap 2: join_deal_with_event (0025) writes two chained deal_events rows
-- (COUNTERPART_JOINED then ACCEPTED) but only re-verifies the first row's
-- prior_hash under the row lock. It never checks that the second row's
-- prior_hash actually equals the first row's new_hash — the one linkage
-- this function itself creates. The sole caller passes it correctly today,
-- so this isn't a live fork, but the check is free (no extra query) and the
-- function's own header already claims to guard exactly this.
--
-- Gap 3: deal_events_guard() (0002) permits UPDATE as long as every column
-- except ots_proof is unchanged — but its whitelist never checks `payload`,
-- so an UPDATE rewriting only payload passes today even though payload is
-- part of the hashed canonical form (lib/db/hash.ts). Becomes load-bearing
-- the instant Gap 1 starts storing real payloads.
-- ============================================================

-- ---- Gap 1a: create_deal_with_event gains p_payload ----
--
-- Adding a trailing parameter is a NEW overload to Postgres, not a REPLACE
-- (CREATE OR REPLACE matches by exact parameter-type signature) -- so the
-- old 16-param version from 0036 must be dropped explicitly first, or both
-- coexist and ambiguous calls fail with "not unique". Same reason 0036
-- itself dropped 0004's signature before defining its own.

drop function if exists create_deal_with_event(
  uuid, text, text, uuid, text, text, bigint, text, text, date, text, text, text, text, text, text
);

create or replace function create_deal_with_event(
  p_id                  uuid,
  p_token               text,
  p_tier                text,
  p_proposer_id         uuid,
  p_proposer_role       text,
  p_item_desc           text,
  p_amount_idr          bigint,
  p_rekening_tujuan     text,
  p_rekening_bank       text,
  p_deadline            date,
  p_new_hash            text,
  p_payment_method      text default 'REKENING',
  p_qris_nmid           text default null,
  p_qris_merchant_name  text default null,
  p_qris_merchant_city  text default null,
  p_qris_image_path     text default null,
  p_payload             jsonb default null
)
returns setof deals
language plpgsql
as $$
begin
  insert into deals (
    id, token, tier, proposer_id, proposer_role,
    item_desc, amount_idr, rekening_tujuan, rekening_bank,
    deadline, status, meterai_applied,
    payment_method, qris_nmid, qris_merchant_name, qris_merchant_city, qris_image_path
  ) values (
    p_id, p_token, p_tier, p_proposer_id, p_proposer_role,
    p_item_desc, p_amount_idr, p_rekening_tujuan, p_rekening_bank,
    p_deadline, 'DRAF', false,
    p_payment_method, p_qris_nmid, p_qris_merchant_name, p_qris_merchant_city, p_qris_image_path
  );

  insert into deal_events (
    deal_id, actor, event, payload, prior_hash, new_hash, ots_proof
  ) values (
    p_id, 'PROPOSER', 'CREATED', p_payload, null, p_new_hash, null
  );

  return query select * from deals where id = p_id;
end;
$$;

revoke execute on function create_deal_with_event(
  uuid, text, text, uuid, text, text, bigint, text, text, date, text, text, text, text, text, text, jsonb
) from public;
grant execute on function create_deal_with_event(
  uuid, text, text, uuid, text, text, bigint, text, text, date, text, text, text, text, text, text, jsonb
) to service_role;

-- ---- Gap 1b + Gap 2: join_deal_with_event gains p_join_payload and the
-- pair-2 linkage check ----
--
-- Same overload hazard as above: drop the 8-param signature from 0025
-- before defining the 9-param version.

drop function if exists join_deal_with_event(uuid, uuid, text, text, text, text, text, text);

create or replace function join_deal_with_event(
  p_deal_id           uuid,
  p_counterpart_id    uuid,
  p_join_prior_hash   text,
  p_join_new_hash     text,
  p_accept_prior_hash text,
  p_accept_new_hash   text,
  p_rekening_tujuan   text default null,
  p_rekening_bank     text default null,
  p_join_payload      jsonb default null
)
returns setof deals
language plpgsql
as $$
declare
  v_actual_prior_hash text;
  v_rows int;
begin
  -- The ACCEPTED event chains onto the COUNTERPART_JOINED event this same
  -- call is about to insert — verifiable without a query, unlike the
  -- pair-1 check below which needs one because the prior state lives in a
  -- row this call didn't just write.
  if p_accept_prior_hash is distinct from p_join_new_hash then
    raise exception 'accept prior_hash must chain from join new_hash';
  end if;

  perform 1 from deals where id = p_deal_id for update;

  select new_hash into v_actual_prior_hash
  from deal_events
  where deal_id = p_deal_id
  order by id desc
  limit 1;

  if v_actual_prior_hash is distinct from p_join_prior_hash then
    return; -- stale prior_hash -- a concurrent event landed first; caller retries
  end if;

  update deals
  set counterpart_id  = p_counterpart_id,
      status          = 'DISEPAKATI',
      rekening_tujuan = coalesce(p_rekening_tujuan, rekening_tujuan),
      rekening_bank   = coalesce(p_rekening_bank, rekening_bank)
  where id     = p_deal_id
    and status = 'DRAF';

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return; -- race: deal already left DRAF
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'COUNTERPART', 'COUNTERPART_JOINED', p_join_payload, p_join_prior_hash, p_join_new_hash, null);

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (p_deal_id, 'SYSTEM', 'ACCEPTED', null, p_accept_prior_hash, p_accept_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function join_deal_with_event(uuid, uuid, text, text, text, text, text, text, jsonb) from public;
grant execute on function join_deal_with_event(uuid, uuid, text, text, text, text, text, text, jsonb) to service_role;

-- ---- Gap 3: deal_events_guard() whitelist gains payload ----

create or replace function deal_events_guard()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'deal_events rows cannot be deleted';
  end if;

  -- UPDATE: permit only if the integrity fields (now including payload,
  -- which is part of the hashed canonical form) are unchanged and only
  -- ots_proof differs.
  if (
    new.id            = old.id            and
    new.deal_id       = old.deal_id       and
    new.actor         = old.actor         and
    new.event         = old.event         and
    new.payload       is not distinct from old.payload and
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
