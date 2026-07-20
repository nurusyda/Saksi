-- Build step 4 follow-on — wires the optional evidence attachment that
-- respondHakJawab (app/deal/[token]/breachActions.ts) already had a
-- has_evidence parameter for but nothing behind (migration 0020's header
-- comment: "hardcoded false here, ready for a real upload step later").
-- Per content/legal/syarat-ketentuan.md §5, evidence is offered only as a
-- response to being reported, never proactively, and never resolves the
-- deal to a clean/positive record (the no-clean-exit rule) — it only sits
-- alongside the dispute on the public record once published.
--
-- A dedicated table rather than reusing `bukti`: bukti's ocr_result/
-- ocr_verdict/attested columns are all specific to transfer-proof semantics
-- (checked against the deal's amount/rekening/bank via Gemini OCR) — a
-- hak-jawab attachment (e.g. a bank statement covering the claimed date
-- range) isn't run through that pipeline at all, so forcing it into `bukti`
-- would mean permanently-null OCR columns for this kind. Storage is still
-- reused: same private `bukti` bucket (migration 0014's service-role-only
-- policy has no path restriction, so it already covers this table's
-- objects under a distinct `hakjawab/` prefix — no new bucket or storage
-- policy needed).

create table hak_jawab_evidence (
  deal_id uuid primary key references deals (id),
  storage_path text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table hak_jawab_evidence enable row level security;

create policy "service role full access on hak_jawab_evidence"
  on hak_jawab_evidence for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- respond_hak_jawab_with_event — re-defined (same atomic pattern, same
-- signature plus two new nullable params) to insert the evidence row inside
-- the same transaction as the HAK_JAWAB_FILED event and the flags/
-- breach_notes updates. Storage upload itself happens in TS before this
-- call (Postgres transactions can't cover Supabase Storage writes) — same
-- split submit_bukti_with_event already uses for bukti uploads.
-- ============================================================

create or replace function respond_hak_jawab_with_event(
  p_deal_id             uuid,
  p_actor               text,
  p_has_evidence        boolean,
  p_response_note       text,
  p_response_note_hash  text,
  p_evidence_storage_path text,
  p_evidence_mime_type  text,
  p_prior_hash          text,
  p_new_hash            text
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

  if p_has_evidence and p_evidence_storage_path is not null then
    insert into hak_jawab_evidence (deal_id, storage_path, mime_type)
    values (p_deal_id, p_evidence_storage_path, p_evidence_mime_type);
  end if;

  return query select * from deals where id = p_deal_id;
end;
$$;

revoke execute on function respond_hak_jawab_with_event(uuid, text, boolean, text, text, text, text, text, text) from public;
grant execute on function respond_hak_jawab_with_event(uuid, text, boolean, text, text, text, text, text, text) to service_role;
