-- Build step 4 — breach report filing ("Barang tidak sesuai kesepakatan",
-- C6). Section C6 was a stub (no RPC call on submit) pending the OTP flow
-- referenced everywhere since 0018/0019 ("that reporting flow doesn't exist
-- yet"). This migration adds: OTP send/verify storage, the atomic
-- report-filing RPC (fires TENGGAT_LEWAT, DIKONFIRMASI_TERIMA ->
-- TIDAK_DIPENUHI, inserts the deal's flags row), and the hak-jawab response
-- RPC (fires HAK_JAWAB_FILED, TIDAK_DIPENUHI -> SENGKETA, per
-- content/legal/syarat-ketentuan.md §5). Auto-publish-on-silence (the sweep
-- side of the 14-day window) and SENGKETA_KADALUARSA are NOT part of this
-- migration — flags.published_at stays null until that follow-up sweep
-- branch ships; there is also no public page reading `flags` yet.

-- ============================================================
-- otp_codes — one row per send. Never stores the plaintext code, only its
-- SHA-256 hash (same treatment migration 0009 gave phone_e164 for identify
-- attempts: rate-limit tables can be public-ish shape, but secrets never sit
-- in a queryable clear-text column). Scoped to breach-report filing only
-- (the one OTP consumer that exists) rather than a generic multi-purpose
-- table — LIMA_RIBU/BERMETERAI OTP (build step 6) is a different, not-yet-
-- built call site; widen this table then; guessing its shape now would be
-- speculative.
-- ============================================================

create table otp_codes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals (id),
  phone_e164 text not null,
  code_hash text not null,
  attempts int not null default 0,
  verified_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index on otp_codes (deal_id, phone_e164, created_at desc);

alter table otp_codes enable row level security;

create policy "service role full access on otp_codes"
  on otp_codes for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- otp_send_attempts — 3 sends/phone/hour (integrations.md §2). Same shape
-- as identify_attempts/accept_attempts (0010/0017): a plain append-only
-- attempt log, counted over a rolling window by the calling action.
-- ============================================================

create table otp_send_attempts (
  id bigint generated always as identity primary key,
  phone_e164 text not null,
  attempted_at timestamptz not null default now()
);

create index on otp_send_attempts (phone_e164, attempted_at);

alter table otp_send_attempts enable row level security;

create policy "service role full access on otp_send_attempts"
  on otp_send_attempts for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- breach_notes — the reporter's/responder's free-text, kept OUT of
-- deal_events entirely. Bug found by monster_check: deal_events has a
-- blanket "public read" RLS policy (migration 0001, `using (true)` for
-- anon/authenticated) written when every event's payload was either null or
-- structured non-PII data (dates, booleans) — never free text a person
-- typed. Putting the raw claim/response note in deal_events.payload would
-- make it queryable by anyone holding the deal token, no identity check at
-- all, the same class of leak as the props-based PII leaks fixed earlier
-- this session. This table gets the same treatment as `bukti`
-- (storage_path/ocr_result): service-role only, no public policy, ever —
-- deliberately not even reusing `flags` (which DOES have a public-read
-- policy once published_at is set), since nothing in copy-id.md's flag
-- templates implies the claimant's raw words should ever go public verbatim.
-- deal_events.payload still gets a SHA-256 hash of the note (see the RPCs
-- below), so the hash chain still witnesses/proves the note's exact content
-- without exposing it.
-- ============================================================

create table breach_notes (
  deal_id uuid primary key references deals (id),
  field_note text not null,
  response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

alter table breach_notes enable row level security;

create policy "service role full access on breach_notes"
  on breach_notes for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- file_barang_tidak_sesuai_with_event — C6's real submit. Same row-lock +
-- prior-hash-recheck pattern as every other atomic transition RPC in this
-- codebase (0004/0011/0015/0018). Three writes in one transaction: the
-- TENGGAT_LEWAT deal_events row (payload carries only a hash of the note,
-- not the note itself), the deal's one-and-only flags row, and the
-- breach_notes row (the actual note text, RLS-locked). p_rung/p_identifiers/
-- p_field_note_hash are computed by the caller (TypeScript), same division
-- of labor as p_ocr_result in submit_bukti_with_event — this function only
-- enforces the state machine and writes what it's given.
-- ============================================================

create or replace function file_barang_tidak_sesuai_with_event(
  p_deal_id        uuid,
  p_actor          text,
  p_field_note     text,
  p_field_note_hash text,
  p_rung           int,
  p_identifiers    jsonb,
  p_prior_hash     text,
  p_new_hash       text
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

  update deals
  set status = 'TIDAK_DIPENUHI'
  where id = p_deal_id
    and status = 'DIKONFIRMASI_TERIMA';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, 'TENGGAT_LEWAT',
    jsonb_build_object('field_note_hash', p_field_note_hash),
    p_prior_hash, p_new_hash, null
  );

  insert into flags (deal_id, rung, identifiers, hak_jawab_status, published_at)
  values (p_deal_id, p_rung, p_identifiers, 'MENUNGGU', null);

  insert into breach_notes (deal_id, field_note)
  values (p_deal_id, p_field_note);

  return query select * from deals where id = p_deal_id;
end;
$$;

-- ============================================================
-- respond_hak_jawab_with_event — the flagged party's response within the
-- 14-day window (content/legal/syarat-ketentuan.md §5: "dengan atau tanpa
-- bukti pendukung, mengubah status catatan menjadi klaim berbeda"). The
-- 14-day deadline itself is checked by the calling action (against the
-- TENGGAT_LEWAT event's created_at) before this RPC is ever called — there
-- is no sweep yet to auto-close a late window at the database level, so the
-- status guard below (TIDAK_DIPENUHI only) is the only DB-level gate.
-- Same deal_events/breach_notes split as the filing RPC above: only a hash
-- of the response note goes into the (publicly readable) event payload.
-- ============================================================

create or replace function respond_hak_jawab_with_event(
  p_deal_id           uuid,
  p_actor             text,
  p_has_evidence      boolean,
  p_response_note     text,
  p_response_note_hash text,
  p_prior_hash        text,
  p_new_hash          text
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
  set status = 'SENGKETA'
  where id = p_deal_id
    and status = 'TIDAK_DIPENUHI';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, 'HAK_JAWAB_FILED',
    jsonb_build_object('has_evidence', p_has_evidence, 'response_note_hash', p_response_note_hash),
    p_prior_hash, p_new_hash, null
  );

  update flags
  set hak_jawab_status = 'DISPUTED'
  where deal_id = p_deal_id;

  update breach_notes
  set response_note = p_response_note, responded_at = now()
  where deal_id = p_deal_id;

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function file_barang_tidak_sesuai_with_event(uuid, text, text, text, int, jsonb, text, text) from public;
revoke execute on function respond_hak_jawab_with_event(uuid, text, boolean, text, text, text, text) from public;

-- Explicit service_role grants — 0019 found new functions get none for free
-- on this project's Supabase instance (auto_expose_new_tables unset).
grant execute on function file_barang_tidak_sesuai_with_event(uuid, text, text, text, int, jsonb, text, text) to service_role;
grant execute on function respond_hak_jawab_with_event(uuid, text, boolean, text, text, text, text) to service_role;
