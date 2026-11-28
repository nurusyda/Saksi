


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."cleanup_draf_deals"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."cleanup_draf_deals"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "tier" "text" DEFAULT 'GRATIS'::"text" NOT NULL,
    "proposer_id" "uuid" NOT NULL,
    "counterpart_id" "uuid",
    "proposer_role" "text" NOT NULL,
    "item_desc" "text" NOT NULL,
    "amount_idr" bigint NOT NULL,
    "rekening_tujuan" "text",
    "rekening_bank" "text",
    "deadline" "date" NOT NULL,
    "status" "text" DEFAULT 'DRAF'::"text" NOT NULL,
    "meterai_applied" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text" DEFAULT 'REKENING'::"text" NOT NULL,
    "qris_nmid" "text",
    "qris_merchant_name" "text",
    "qris_merchant_city" "text",
    "qris_image_path" "text",
    CONSTRAINT "deals_amount_idr_check" CHECK (("amount_idr" > 0)),
    CONSTRAINT "deals_payment_destination_set_after_draf" CHECK ((("status" = 'DRAF'::"text") OR (("payment_method" = 'REKENING'::"text") AND ("rekening_tujuan" IS NOT NULL) AND ("rekening_bank" IS NOT NULL)) OR (("payment_method" = 'QRIS'::"text") AND ("qris_merchant_name" IS NOT NULL)))),
    CONSTRAINT "deals_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['REKENING'::"text", 'QRIS'::"text"]))),
    CONSTRAINT "deals_proposer_role_check" CHECK (("proposer_role" = ANY (ARRAY['PENJUAL'::"text", 'PEMBELI'::"text", 'PEMBERI_PINJAMAN'::"text", 'PEMINJAM'::"text", 'PEMILIK'::"text", 'PENYEWA'::"text", 'LAINNYA'::"text"]))),
    CONSTRAINT "deals_status_check" CHECK (("status" = ANY (ARRAY['DRAF'::"text", 'DIAJUKAN'::"text", 'DISEPAKATI'::"text", 'DIBAYAR_DIKLAIM'::"text", 'DIKONFIRMASI_TERIMA'::"text", 'SELESAI'::"text", 'DIBATALKAN_BERSAMA'::"text", 'TIDAK_DILANJUTKAN'::"text", 'KEDALUWARSA'::"text", 'DIKEMBALIKAN_PENUH'::"text", 'DIKEMBALIKAN_SEBAGIAN'::"text", 'TIDAK_DIPENUHI'::"text", 'SENGKETA'::"text"]))),
    CONSTRAINT "deals_tier_check" CHECK (("tier" = 'GRATIS'::"text"))
);


ALTER TABLE "public"."deals" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_fulfillment_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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
  set status = 'SELESAI'
  where id = p_deal_id
    and status = 'DIKONFIRMASI_TERIMA';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'FULFILLMENT_CONFIRMED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."confirm_fulfillment_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_receipt_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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
  set status = 'DIKONFIRMASI_TERIMA'
  where id = p_deal_id
    and status = 'DIBAYAR_DIKLAIM';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'RECEIPT_CONFIRMED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."confirm_receipt_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_deal_with_event"("p_id" "uuid", "p_token" "text", "p_tier" "text", "p_proposer_id" "uuid", "p_proposer_role" "text", "p_item_desc" "text", "p_amount_idr" bigint, "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_deadline" "date", "p_new_hash" "text", "p_payment_method" "text" DEFAULT 'REKENING'::"text", "p_qris_nmid" "text" DEFAULT NULL::"text", "p_qris_merchant_name" "text" DEFAULT NULL::"text", "p_qris_merchant_city" "text" DEFAULT NULL::"text", "p_qris_image_path" "text" DEFAULT NULL::"text", "p_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."create_deal_with_event"("p_id" "uuid", "p_token" "text", "p_tier" "text", "p_proposer_id" "uuid", "p_proposer_role" "text", "p_item_desc" "text", "p_amount_idr" bigint, "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_deadline" "date", "p_new_hash" "text", "p_payment_method" "text", "p_qris_nmid" "text", "p_qris_merchant_name" "text", "p_qris_merchant_city" "text", "p_qris_image_path" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deal_events_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."deal_events_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."file_barang_tidak_sesuai_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_rung" integer, "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."file_barang_tidak_sesuai_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_rung" integer, "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."file_deadline_lapse_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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
    and status = 'DIBAYAR_DIKLAIM';

  if not found then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, 'TENGGAT_LEWAT',
    jsonb_build_object('field_note_hash', p_field_note_hash),
    p_prior_hash, p_new_hash, null
  );

  -- rung fixed at 0 (not a caller-supplied parameter, unlike 0020's
  -- p_rung): DIBAYAR_DIKLAIM means RECEIPT_CONFIRMED has never fired for
  -- this deal, so data-model.md's rung rule ("bukti confirmed by
  -- counterpart earlier? rung 1 : rung 0") resolves to 0 unconditionally
  -- here, the mirror of file_barang_tidak_sesuai_with_event's rung-1 case.
  insert into flags (deal_id, rung, identifiers, hak_jawab_status, published_at)
  values (p_deal_id, 0, p_identifiers, 'MENUNGGU', null);

  -- field_note is optional for this entry point (the claim itself is
  -- system-derivable: deadline passed, no receipt confirmation), unlike C6
  -- where the reporter must describe which part of the description wasn't
  -- met. coalesce guards breach_notes.field_note's NOT NULL constraint.
  insert into breach_notes (deal_id, field_note)
  values (p_deal_id, coalesce(p_field_note, ''));

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."file_deadline_lapse_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_flag_publish_candidates"("p_now" timestamp with time zone) RETURNS SETOF "public"."deals"
    LANGUAGE "sql" STABLE
    AS $$
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


ALTER FUNCTION "public"."get_flag_publish_candidates"("p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_kedaluwarsa_candidates"("p_today_wib" "date") RETURNS SETOF "public"."deals"
    LANGUAGE "sql" STABLE
    AS $$
  select d.*
  from deals d
  where d.status in ('DIBAYAR_DIKLAIM', 'DIKONFIRMASI_TERIMA')
    and d.deadline <= p_today_wib - interval '30 days'
    and not exists (
      select 1 from flags f where f.deal_id = d.id
    );
$$;


ALTER FUNCTION "public"."get_kedaluwarsa_candidates"("p_today_wib" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_nudge_candidates"("p_today_wib" "date") RETURNS SETOF "public"."deals"
    LANGUAGE "sql" STABLE
    AS $$
  select d.*
  from deals d
  where d.status in ('DIBAYAR_DIKLAIM', 'DIKONFIRMASI_TERIMA')
    and d.deadline <= p_today_wib - interval '2 days'
    and not exists (
      select 1 from deal_events e
      where e.deal_id = d.id and e.event = 'NUDGE_SENT'
    );
$$;


ALTER FUNCTION "public"."get_nudge_candidates"("p_today_wib" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_deal_with_event"("p_deal_id" "uuid", "p_counterpart_id" "uuid", "p_join_prior_hash" "text", "p_join_new_hash" "text", "p_accept_prior_hash" "text", "p_accept_new_hash" "text", "p_rekening_tujuan" "text" DEFAULT NULL::"text", "p_rekening_bank" "text" DEFAULT NULL::"text", "p_join_payload" "jsonb" DEFAULT NULL::"jsonb") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."join_deal_with_event"("p_deal_id" "uuid", "p_counterpart_id" "uuid", "p_join_prior_hash" "text", "p_join_new_hash" "text", "p_accept_prior_hash" "text", "p_accept_new_hash" "text", "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_join_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_flag_disputed_with_event"("p_deal_id" "uuid", "p_has_evidence" boolean, "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."publish_flag_disputed_with_event"("p_deal_id" "uuid", "p_has_evidence" boolean, "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_flag_silent_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."publish_flag_silent_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_deal_statement_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_kind" "text", "p_body" "text", "p_body_hash" "text", "p_required_status" "text", "p_event" "text", "p_prior_hash" "text", "p_new_hash" "text", "p_image_path" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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
    select 1 from deals where id = p_deal_id and status = p_required_status
  ) then
    return;
  end if;

  insert into deal_events (deal_id, actor, event, payload, prior_hash, new_hash, ots_proof)
  values (
    p_deal_id, p_actor, p_event,
    jsonb_build_object('body_hash', p_body_hash),
    p_prior_hash, p_new_hash, null
  );

  insert into deal_statements (deal_id, actor, kind, body, image_path)
  values (p_deal_id, p_actor, p_kind, p_body, p_image_path);

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."record_deal_statement_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_kind" "text", "p_body" "text", "p_body_hash" "text", "p_required_status" "text", "p_event" "text", "p_prior_hash" "text", "p_new_hash" "text", "p_image_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_evidence_storage_path" "text", "p_evidence_mime_type" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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

  if p_has_evidence and p_evidence_storage_path is not null then
    insert into hak_jawab_evidence (deal_id, storage_path, mime_type)
    values (p_deal_id, p_evidence_storage_path, p_evidence_mime_type);
  end if;

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_evidence_storage_path" "text", "p_evidence_mime_type" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resubmit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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

  insert into bukti (
    id, deal_id, uploader, kind, storage_path, ocr_result, ocr_verdict, attested
  ) values (
    p_bukti_id, p_deal_id, p_uploader, 'TRANSFER', p_storage_path, p_ocr_result, p_ocr_verdict, p_attested
  );

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'BUKTI_UPLOADED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."resubmit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."retract_flag_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_retraction_reason" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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

  -- Only retract a flag that is published and not already retracted.
  update flags
  set retracted_at = now(),
      retraction_reason = p_retraction_reason
  where deal_id = p_deal_id
    and published_at is not null
    and retracted_at is null;

  if not found then
    return;
  end if;

  -- Self-transition — status unchanged. The retraction is recorded as an event
  -- so the hash chain witnesses it.
  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'FLAG_RETRACTED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."retract_flag_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_retraction_reason" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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
  set status = 'DIBAYAR_DIKLAIM'
  where id = p_deal_id
    and status = 'DISEPAKATI';

  if not found then
    return;
  end if;

  insert into bukti (
    id, deal_id, uploader, kind, storage_path, ocr_result, ocr_verdict, attested
  ) values (
    p_bukti_id, p_deal_id, p_uploader, 'TRANSFER', p_storage_path, p_ocr_result, p_ocr_verdict, p_attested
  );

  insert into deal_events (deal_id, actor, event, prior_hash, new_hash, ots_proof)
  values (p_deal_id, p_actor, 'BUKTI_UPLOADED', p_prior_hash, p_new_hash, null);

  return query select * from deals where id = p_deal_id;
end;
$$;


ALTER FUNCTION "public"."submit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sweep_kedaluwarsa_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."sweep_kedaluwarsa_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sweep_nudge_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") RETURNS SETOF "public"."deals"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."sweep_nudge_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."breach_notes" (
    "deal_id" "uuid" NOT NULL,
    "field_note" "text" NOT NULL,
    "response_note" "text",
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."breach_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bukti" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "uploader" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "ocr_result" "jsonb",
    "ocr_verdict" "text",
    "attested" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bukti_kind_check" CHECK (("kind" = ANY (ARRAY['TRANSFER'::"text", 'REFUND'::"text"]))),
    CONSTRAINT "bukti_ocr_verdict_check" CHECK (("ocr_verdict" = ANY (ARRAY['KONSISTEN'::"text", 'TIDAK_KONSISTEN'::"text", 'TIDAK_TERBACA'::"text"]))),
    CONSTRAINT "bukti_uploader_check" CHECK (("uploader" = ANY (ARRAY['PROPOSER'::"text", 'COUNTERPART'::"text"])))
);


ALTER TABLE "public"."bukti" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_events" (
    "id" bigint NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "actor" "text" NOT NULL,
    "event" "text" NOT NULL,
    "payload" "jsonb",
    "prior_hash" "text",
    "new_hash" "text" NOT NULL,
    "ots_proof" "bytea",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "deal_events_actor_check" CHECK (("actor" = ANY (ARRAY['PROPOSER'::"text", 'COUNTERPART'::"text", 'SYSTEM'::"text"])))
);


ALTER TABLE "public"."deal_events" OWNER TO "postgres";


ALTER TABLE "public"."deal_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."deal_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deal_statements" (
    "id" bigint NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "actor" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_path" "text",
    CONSTRAINT "deal_statements_actor_check" CHECK (("actor" = ANY (ARRAY['PROPOSER'::"text", 'COUNTERPART'::"text"]))),
    CONSTRAINT "deal_statements_kind_check" CHECK (("kind" = ANY (ARRAY['DANA_BELUM_MASUK'::"text", 'BARANG_TIDAK_SESUAI'::"text", 'PENJUAL_JAWAB'::"text"])))
);


ALTER TABLE "public"."deal_statements" OWNER TO "postgres";


ALTER TABLE "public"."deal_statements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."deal_statements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."deal_status_poll_attempts" (
    "id" bigint NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deal_status_poll_attempts" OWNER TO "postgres";


ALTER TABLE "public"."deal_status_poll_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."deal_status_poll_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE OR REPLACE VIEW "public"."deals_public" AS
 SELECT "id",
    "token",
    "tier",
    "proposer_id",
    "counterpart_id",
    "proposer_role",
    "item_desc",
    "amount_idr",
    "regexp_replace"("rekening_tujuan", '^(.{2})(.+)(.{2})$'::"text", (('\1'::"text" || "repeat"('•'::"text", ("length"("rekening_tujuan") - 4))) || '\3'::"text")) AS "rekening_tujuan_masked",
    "rekening_bank",
    "payment_method",
    "qris_nmid",
    "qris_merchant_name",
    "qris_merchant_city",
    "deadline",
    "status",
    "meterai_applied",
    "created_at"
   FROM "public"."deals"
  WHERE ("status" <> 'DRAF'::"text");


ALTER VIEW "public"."deals_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_interest" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_hash" "text" NOT NULL,
    "feature" "text" NOT NULL,
    "opted_in_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feature_interest_feature_check" CHECK (("feature" = ANY (ARRAY['pinjam_meminjam'::"text", 'sewa_menyewa'::"text", 'tier_lima_ribu'::"text", 'tier_bermeterai'::"text"])))
);


ALTER TABLE "public"."feature_interest" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "rung" integer DEFAULT 0 NOT NULL,
    "identifiers" "jsonb" NOT NULL,
    "hak_jawab_status" "text" DEFAULT 'MENUNGGU'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retracted_at" timestamp with time zone,
    "retraction_reason" "text",
    CONSTRAINT "flags_hak_jawab_status_check" CHECK (("hak_jawab_status" = ANY (ARRAY['MENUNGGU'::"text", 'DIJAWAB'::"text", 'DISPUTED'::"text", 'KADALUARSA'::"text"]))),
    CONSTRAINT "flags_rung_check" CHECK (("rung" = ANY (ARRAY[0, 1, 2])))
);


ALTER TABLE "public"."flags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hak_jawab_evidence" (
    "deal_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hak_jawab_evidence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identify_attempts" (
    "id" bigint NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."identify_attempts" OWNER TO "postgres";


ALTER TABLE "public"."identify_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."identify_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."lookup_attempts" (
    "id" bigint NOT NULL,
    "ip_hash" "text" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lookup_attempts" OWNER TO "postgres";


ALTER TABLE "public"."lookup_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."lookup_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."otp_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "phone_e164" "text" NOT NULL,
    "code_hash" "text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "verified_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."otp_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_send_attempts" (
    "id" bigint NOT NULL,
    "phone_e164" "text" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."otp_send_attempts" OWNER TO "postgres";


ALTER TABLE "public"."otp_send_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."otp_send_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."parties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "phone_e164" "text" NOT NULL,
    "phone_hash" "text" NOT NULL,
    "phone_verified_at" timestamp with time zone,
    "ekyc_status" "text" DEFAULT 'NONE'::"text" NOT NULL,
    "ekyc_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parties_ekyc_status_check" CHECK (("ekyc_status" = ANY (ARRAY['NONE'::"text", 'PASSED'::"text", 'FAILED'::"text"])))
);


ALTER TABLE "public"."parties" OWNER TO "postgres";


COMMENT ON COLUMN "public"."parties"."phone_verified_at" IS 'set by OTP success (breach filing or future identity verification)';



CREATE OR REPLACE VIEW "public"."parties_public" AS
 SELECT "id",
    "phone_hash",
    "ekyc_status",
    "created_at"
   FROM "public"."parties";


ALTER VIEW "public"."parties_public" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_evidence" (
    "deal_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."report_evidence" OWNER TO "postgres";


ALTER TABLE ONLY "public"."breach_notes"
    ADD CONSTRAINT "breach_notes_pkey" PRIMARY KEY ("deal_id");



ALTER TABLE ONLY "public"."bukti"
    ADD CONSTRAINT "bukti_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_events"
    ADD CONSTRAINT "deal_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_statements"
    ADD CONSTRAINT "deal_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_status_poll_attempts"
    ADD CONSTRAINT "deal_status_poll_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_phone_hash_feature_key" UNIQUE ("phone_hash", "feature");



ALTER TABLE ONLY "public"."feature_interest"
    ADD CONSTRAINT "feature_interest_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."flags"
    ADD CONSTRAINT "flags_deal_id_key" UNIQUE ("deal_id");



ALTER TABLE ONLY "public"."flags"
    ADD CONSTRAINT "flags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hak_jawab_evidence"
    ADD CONSTRAINT "hak_jawab_evidence_pkey" PRIMARY KEY ("deal_id");



ALTER TABLE ONLY "public"."identify_attempts"
    ADD CONSTRAINT "identify_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lookup_attempts"
    ADD CONSTRAINT "lookup_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_codes"
    ADD CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_send_attempts"
    ADD CONSTRAINT "otp_send_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parties"
    ADD CONSTRAINT "parties_phone_e164_key" UNIQUE ("phone_e164");



ALTER TABLE ONLY "public"."parties"
    ADD CONSTRAINT "parties_phone_hash_key" UNIQUE ("phone_hash");



ALTER TABLE ONLY "public"."parties"
    ADD CONSTRAINT "parties_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_evidence"
    ADD CONSTRAINT "report_evidence_pkey" PRIMARY KEY ("deal_id");



CREATE INDEX "bukti_deal_id_idx" ON "public"."bukti" USING "btree" ("deal_id");



CREATE INDEX "deal_events_deal_id_created_at_idx" ON "public"."deal_events" USING "btree" ("deal_id", "created_at");



CREATE INDEX "deal_events_deal_id_idx" ON "public"."deal_events" USING "btree" ("deal_id");



CREATE INDEX "deal_statements_deal_id_idx" ON "public"."deal_statements" USING "btree" ("deal_id");



CREATE INDEX "deal_status_poll_attempts_deal_id_attempted_at_idx" ON "public"."deal_status_poll_attempts" USING "btree" ("deal_id", "attempted_at");



CREATE INDEX "deals_counterpart_id_idx" ON "public"."deals" USING "btree" ("counterpart_id");



CREATE INDEX "deals_proposer_id_idx" ON "public"."deals" USING "btree" ("proposer_id");



CREATE INDEX "deals_status_idx" ON "public"."deals" USING "btree" ("status");



CREATE INDEX "deals_token_idx" ON "public"."deals" USING "btree" ("token");



CREATE INDEX "flags_deal_id_idx" ON "public"."flags" USING "btree" ("deal_id");



CREATE INDEX "identify_attempts_deal_id_attempted_at_idx" ON "public"."identify_attempts" USING "btree" ("deal_id", "attempted_at");



CREATE INDEX "lookup_attempts_ip_hash_attempted_at_idx" ON "public"."lookup_attempts" USING "btree" ("ip_hash", "attempted_at");



CREATE INDEX "otp_codes_deal_id_phone_e164_created_at_idx" ON "public"."otp_codes" USING "btree" ("deal_id", "phone_e164", "created_at" DESC);



CREATE INDEX "otp_send_attempts_phone_e164_attempted_at_idx" ON "public"."otp_send_attempts" USING "btree" ("phone_e164", "attempted_at");



CREATE OR REPLACE TRIGGER "deal_events_immutable" BEFORE DELETE OR UPDATE ON "public"."deal_events" FOR EACH ROW EXECUTE FUNCTION "public"."deal_events_guard"();



ALTER TABLE ONLY "public"."breach_notes"
    ADD CONSTRAINT "breach_notes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."bukti"
    ADD CONSTRAINT "bukti_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."deal_events"
    ADD CONSTRAINT "deal_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."deal_statements"
    ADD CONSTRAINT "deal_statements_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."deal_status_poll_attempts"
    ADD CONSTRAINT "deal_status_poll_attempts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_counterpart_id_fkey" FOREIGN KEY ("counterpart_id") REFERENCES "public"."parties"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_proposer_id_fkey" FOREIGN KEY ("proposer_id") REFERENCES "public"."parties"("id");



ALTER TABLE ONLY "public"."flags"
    ADD CONSTRAINT "flags_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."hak_jawab_evidence"
    ADD CONSTRAINT "hak_jawab_evidence_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."identify_attempts"
    ADD CONSTRAINT "identify_attempts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."otp_codes"
    ADD CONSTRAINT "otp_codes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE ONLY "public"."report_evidence"
    ADD CONSTRAINT "report_evidence_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id");



ALTER TABLE "public"."breach_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bukti" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_status_poll_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feature_interest" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."flags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hak_jawab_evidence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."identify_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lookup_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_send_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."parties" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read flags" ON "public"."flags" FOR SELECT TO "authenticated", "anon" USING (("published_at" IS NOT NULL));



ALTER TABLE "public"."report_evidence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role full access on breach_notes" ON "public"."breach_notes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on bukti" ON "public"."bukti" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on deal_events" ON "public"."deal_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on deal_statements" ON "public"."deal_statements" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on deal_status_poll_attempts" ON "public"."deal_status_poll_attempts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on deals" ON "public"."deals" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on feature_interest" ON "public"."feature_interest" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on flags" ON "public"."flags" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on hak_jawab_evidence" ON "public"."hak_jawab_evidence" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on identify_attempts" ON "public"."identify_attempts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on lookup_attempts" ON "public"."lookup_attempts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on otp_codes" ON "public"."otp_codes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on otp_send_attempts" ON "public"."otp_send_attempts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on parties" ON "public"."parties" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access on report_evidence" ON "public"."report_evidence" TO "service_role" USING (true) WITH CHECK (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."cleanup_draf_deals"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_draf_deals"() TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_fulfillment_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_fulfillment_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_fulfillment_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_fulfillment_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_receipt_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_receipt_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_receipt_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_receipt_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_deal_with_event"("p_id" "uuid", "p_token" "text", "p_tier" "text", "p_proposer_id" "uuid", "p_proposer_role" "text", "p_item_desc" "text", "p_amount_idr" bigint, "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_deadline" "date", "p_new_hash" "text", "p_payment_method" "text", "p_qris_nmid" "text", "p_qris_merchant_name" "text", "p_qris_merchant_city" "text", "p_qris_image_path" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_deal_with_event"("p_id" "uuid", "p_token" "text", "p_tier" "text", "p_proposer_id" "uuid", "p_proposer_role" "text", "p_item_desc" "text", "p_amount_idr" bigint, "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_deadline" "date", "p_new_hash" "text", "p_payment_method" "text", "p_qris_nmid" "text", "p_qris_merchant_name" "text", "p_qris_merchant_city" "text", "p_qris_image_path" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."file_barang_tidak_sesuai_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_rung" integer, "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."file_barang_tidak_sesuai_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_rung" integer, "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."file_deadline_lapse_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."file_deadline_lapse_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_field_note" "text", "p_field_note_hash" "text", "p_identifiers" "jsonb", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_flag_publish_candidates"("p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_flag_publish_candidates"("p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_kedaluwarsa_candidates"("p_today_wib" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_kedaluwarsa_candidates"("p_today_wib" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_nudge_candidates"("p_today_wib" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_nudge_candidates"("p_today_wib" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."join_deal_with_event"("p_deal_id" "uuid", "p_counterpart_id" "uuid", "p_join_prior_hash" "text", "p_join_new_hash" "text", "p_accept_prior_hash" "text", "p_accept_new_hash" "text", "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_join_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_deal_with_event"("p_deal_id" "uuid", "p_counterpart_id" "uuid", "p_join_prior_hash" "text", "p_join_new_hash" "text", "p_accept_prior_hash" "text", "p_accept_new_hash" "text", "p_rekening_tujuan" "text", "p_rekening_bank" "text", "p_join_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_flag_disputed_with_event"("p_deal_id" "uuid", "p_has_evidence" boolean, "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_flag_disputed_with_event"("p_deal_id" "uuid", "p_has_evidence" boolean, "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."publish_flag_silent_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_flag_silent_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_deal_statement_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_kind" "text", "p_body" "text", "p_body_hash" "text", "p_required_status" "text", "p_event" "text", "p_prior_hash" "text", "p_new_hash" "text", "p_image_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_deal_statement_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_kind" "text", "p_body" "text", "p_body_hash" "text", "p_required_status" "text", "p_event" "text", "p_prior_hash" "text", "p_new_hash" "text", "p_image_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_evidence_storage_path" "text", "p_evidence_mime_type" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."respond_hak_jawab_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_has_evidence" boolean, "p_response_note" "text", "p_response_note_hash" "text", "p_evidence_storage_path" "text", "p_evidence_mime_type" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resubmit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resubmit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."retract_flag_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_retraction_reason" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."retract_flag_with_event"("p_deal_id" "uuid", "p_actor" "text", "p_retraction_reason" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_bukti_with_event"("p_bukti_id" "uuid", "p_deal_id" "uuid", "p_uploader" "text", "p_storage_path" "text", "p_attested" boolean, "p_ocr_result" "jsonb", "p_ocr_verdict" "text", "p_actor" "text", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sweep_kedaluwarsa_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sweep_kedaluwarsa_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_kedaluwarsa_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_kedaluwarsa_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sweep_nudge_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sweep_nudge_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."sweep_nudge_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sweep_nudge_with_event"("p_deal_id" "uuid", "p_prior_hash" "text", "p_new_hash" "text") TO "service_role";
























GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."breach_notes" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."breach_notes" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."breach_notes" TO "service_role";



GRANT ALL ON TABLE "public"."bukti" TO "anon";
GRANT ALL ON TABLE "public"."bukti" TO "authenticated";
GRANT ALL ON TABLE "public"."bukti" TO "service_role";



GRANT ALL ON TABLE "public"."deal_events" TO "anon";
GRANT ALL ON TABLE "public"."deal_events" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deal_statements" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deal_statements" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deal_statements" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deal_status_poll_attempts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deal_status_poll_attempts" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deal_status_poll_attempts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deals_public" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deals_public" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."deals_public" TO "service_role";



GRANT ALL ON TABLE "public"."feature_interest" TO "anon";
GRANT ALL ON TABLE "public"."feature_interest" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_interest" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."flags" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."flags" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."flags" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hak_jawab_evidence" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hak_jawab_evidence" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hak_jawab_evidence" TO "service_role";



GRANT ALL ON TABLE "public"."identify_attempts" TO "anon";
GRANT ALL ON TABLE "public"."identify_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."identify_attempts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lookup_attempts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lookup_attempts" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."lookup_attempts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_codes" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_codes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_codes" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_send_attempts" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_send_attempts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."otp_send_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."parties" TO "anon";
GRANT ALL ON TABLE "public"."parties" TO "authenticated";
GRANT ALL ON TABLE "public"."parties" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parties_public" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parties_public" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."parties_public" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_evidence" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_evidence" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."report_evidence" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";



































