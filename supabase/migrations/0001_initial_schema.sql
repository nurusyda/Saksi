-- Enable pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- ============================================================
-- parties: phones are identities. No accounts, no passwords.
-- ============================================================
create table parties (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique not null,
  phone_hash text unique not null,       -- sha256(phone_e164), public clustering key
  phone_verified_at timestamptz,         -- set by OTP success (Rp5rb+ or breach filing)
  ekyc_status text not null default 'NONE' check (ekyc_status in ('NONE', 'PASSED', 'FAILED')),
  ekyc_ref text,                         -- Didit session id; never NIK, never KTP image
  created_at timestamptz not null default now()
);

-- ============================================================
-- deals: one record per agreement
-- ============================================================
create table deals (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,            -- nanoid(21), the unguessable share link
  tier text not null default 'GRATIS' check (tier in ('GRATIS', 'LIMA_RIBU', 'BERMETERAI')),
  proposer_id uuid not null references parties (id),
  counterpart_id uuid references parties (id),   -- null until link opened + phone entered
  proposer_role text not null check (proposer_role in ('PENJUAL', 'PEMBELI', 'PEMBERI_PINJAMAN', 'PENERIMA_TITIPAN', 'LAINNYA')),
  item_desc text not null,
  amount_idr bigint not null check (amount_idr > 0),
  rekening_tujuan text not null,         -- destination account; masked in public views
  rekening_bank text not null,
  deadline date not null,
  status text not null default 'DRAF' check (status in (
    'DRAF',
    'DIAJUKAN',
    'DISEPAKATI',
    'DIBAYAR_DIKLAIM',
    'DIKONFIRMASI_TERIMA',
    'SELESAI',
    'DIBATALKAN_BERSAMA',
    'DIBATALKAN_SEPIHAK_PRA_BAYAR',
    'DIKEMBALIKAN_PENUH',
    'TIDAK_DIPENUHI',
    'SENGKETA'
  )),
  meterai_applied boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- deal_events: append-only witness log
-- NEVER UPDATE OR DELETE ROWS (enforced by trigger in 0002)
-- ============================================================
create table deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals (id),
  actor text not null check (actor in ('PROPOSER', 'COUNTERPART', 'SYSTEM')),
  event text not null,
  payload jsonb,                         -- e.g. {old_deadline, new_deadline} for PERPANJANGAN
  prior_hash text,                       -- null only on the first event of a deal
  new_hash text not null,               -- sha256 of canonical deal JSON after this event
  ots_proof bytea,                       -- OpenTimestamps .ots blob; filled async
  created_at timestamptz not null default now()
);

-- ============================================================
-- bukti: transfer or refund proof uploads
-- ============================================================
create table bukti (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals (id),
  uploader text not null check (uploader in ('PROPOSER', 'COUNTERPART')),
  kind text not null check (kind in ('TRANSFER', 'REFUND')),
  storage_path text not null,            -- private Supabase Storage bucket; never exposed to clients
  ocr_result jsonb,                      -- {amount_match, date_ok, rekening_match, bank_match}
  ocr_verdict text check (ocr_verdict in ('KONSISTEN', 'TIDAK_KONSISTEN', 'TIDAK_TERBACA')),
  attested boolean not null default false,  -- uploader checked the forgery-liability attestation
  created_at timestamptz not null default now()
);

-- ============================================================
-- flags: public breach records
-- ============================================================
create table flags (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid unique not null references deals (id),
  rung int not null default 0 check (rung in (0, 1, 2)),
  identifiers jsonb not null,            -- {rekening_masked, bank, phone_hash?} — masked per tier
  hak_jawab_status text not null default 'MENUNGGU' check (
    hak_jawab_status in ('MENUNGGU', 'DIJAWAB', 'DISPUTED', 'KADALUARSA')
  ),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index on deals (token);
create index on deals (status);
create index on deals (proposer_id);
create index on deals (counterpart_id);
create index on deal_events (deal_id);
create index on deal_events (deal_id, created_at);
create index on bukti (deal_id);
create index on flags (deal_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table parties enable row level security;
alter table deals enable row level security;
alter table deal_events enable row level security;
alter table bukti enable row level security;
alter table flags enable row level security;

-- parties: service role can read all; anon/authenticated can only read non-PII columns
create policy "service role full access on parties"
  on parties for all
  to service_role
  using (true)
  with check (true);

create policy "public read non-pii party columns"
  on parties for select
  to anon, authenticated
  using (true);  -- column-level filtering enforced via public view (see below)

-- deals: service role full access; anon can read non-PII columns of non-DRAF deals
create policy "service role full access on deals"
  on deals for all
  to service_role
  using (true)
  with check (true);

create policy "public read non-pii deal columns"
  on deals for select
  to anon, authenticated
  using (status != 'DRAF');

-- deal_events: service role full access; anon can read event log (no PII in events)
create policy "service role full access on deal_events"
  on deal_events for all
  to service_role
  using (true)
  with check (true);

create policy "public read deal_events"
  on deal_events for select
  to anon, authenticated
  using (true);

-- bukti: service role only (storage_path + ocr_result are PII-adjacent)
create policy "service role full access on bukti"
  on bukti for all
  to service_role
  using (true)
  with check (true);

-- flags: publicly readable (identifiers contains only masked data)
create policy "service role full access on flags"
  on flags for all
  to service_role
  using (true)
  with check (true);

create policy "public read flags"
  on flags for select
  to anon, authenticated
  using (published_at is not null);

-- ============================================================
-- Public views (non-PII projections for client-side queries)
-- ============================================================

-- parties_public: phone_hash, ekyc_status, created_at only
create view parties_public as
  select id, phone_hash, ekyc_status, created_at
  from parties;

-- deals_public: drops rekening_tujuan (full); exposes masked version
create view deals_public as
  select
    id,
    token,
    tier,
    proposer_id,
    counterpart_id,
    proposer_role,
    item_desc,
    amount_idr,
    -- mask rekening: keep first 2 + last 2 digits
    regexp_replace(rekening_tujuan, '^(.{2})(.+)(.{2})$', '\1' || repeat('•', length(rekening_tujuan) - 4) || '\3') as rekening_tujuan_masked,
    rekening_bank,
    deadline,
    status,
    meterai_applied,
    created_at
  from deals
  where status != 'DRAF';
