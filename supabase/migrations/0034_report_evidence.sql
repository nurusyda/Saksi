-- ============================================================
-- 0034 — optional supporting image on the formal "barang tidak sesuai" report
--
-- §45 follow-up. The clarification loop (deal_statements, migration 0033) now
-- carries an image on both sides. The FORMAL report path lagged behind: the
-- seller's hak-jawab response could already attach evidence
-- (hak_jawab_evidence, 0022), but the buyer's initial report
-- (fileBarangTidakSesuaiReport) could not — an asymmetry a buyer noticed
-- immediately ("barang tidak sesuai still has no upload photo").
--
-- A dedicated table rather than reusing hak_jawab_evidence: that table is keyed
-- by deal_id as its primary key and holds the RESPONDER's evidence. The
-- reporter's evidence is a distinct row for the same deal, so it gets its own
-- table rather than a PK change to the working responder path. Same private
-- 'bukti' bucket (0014's policy has no path restriction), under a `report/`
-- prefix. Not OCR'd, not hash-chained (the report event payload carries only
-- field_note_hash, exactly as before) — shown attributed, never vouched for,
-- the same tier as every other evidence artifact here.
-- ============================================================

create table report_evidence (
  deal_id uuid primary key references deals (id),
  storage_path text not null,
  mime_type text not null,
  created_at timestamptz not null default now()
);

alter table report_evidence enable row level security;

create policy "service role full access on report_evidence"
  on report_evidence for all
  to service_role
  using (true)
  with check (true);

grant select, insert on report_evidence to service_role;
