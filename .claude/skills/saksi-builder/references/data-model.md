# SAKSI Data Model & State Machine

## Tables (Postgres / Supabase)

```sql
-- People are phones. No accounts.
create table parties (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique not null,          -- RLS-protected, never in public views
  phone_hash text unique not null,          -- sha256(phone_e164), public clustering key
  phone_verified_at timestamptz,            -- set by OTP success (Rp5rb+ or breach filing)
  ekyc_status text default 'NONE',          -- NONE | PASSED | FAILED (Didit)
  ekyc_ref text,                            -- Didit session id
  created_at timestamptz default now()
);

create table deals (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,               -- nanoid(21), the share link
  tier text not null default 'GRATIS',      -- GRATIS | LIMA_RIBU | BERMETERAI
  proposer_id uuid references parties,
  counterpart_id uuid references parties,   -- null until link opened & phone entered
  proposer_role text not null,              -- PENJUAL | PEMBELI | PEMBERI_PINJAMAN | ...
  item_desc text not null,
  amount_idr bigint not null,
  rekening_tujuan text not null,            -- destination account; masked in public views
  rekening_bank text not null,
  deadline date not null,
  status text not null default 'DRAF',
  meterai_applied boolean default false,
  created_at timestamptz default now()
);

-- Append-only witness log. NEVER update or delete rows.
create table deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid references deals not null,
  actor text not null,                      -- PROPOSER | COUNTERPART | SYSTEM
  event text not null,                      -- state-machine transition name
  payload jsonb,                            -- e.g. new deadline for PERPANJANGAN
  prior_hash text,
  new_hash text not null,                   -- sha256(canonical deal JSON after event)
  ots_proof bytea,                          -- OpenTimestamps proof, filled async
  created_at timestamptz default now()
);

create table bukti (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals not null,
  uploader text not null,                   -- PROPOSER | COUNTERPART
  kind text not null,                       -- TRANSFER | REFUND
  storage_path text not null,               -- private bucket
  ocr_result jsonb,                         -- {amount_match, date_ok, rekening_match, bank_match}
  ocr_verdict text,                         -- KONSISTEN | TIDAK_KONSISTEN | TIDAK_TERBACA
  attested boolean not null default false,  -- uploader checked the forgery-liability attestation
  created_at timestamptz default now()
);

create table flags (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid unique references deals not null,
  rung int not null default 0,              -- 0 claimed | 1 both-confirmed | 2 bank-verified
  identifiers jsonb not null,               -- {rekening_masked, bank, phone_hash?} per tier
  hak_jawab_status text default 'MENUNGGU', -- MENUNGGU | DIJAWAB | DISPUTED | KADALUARSA
  published_at timestamptz,
  created_at timestamptz default now()
);
```

RLS: `parties.phone_e164`, `bukti.storage_path` readable only by service role. Public views expose: masked rekening (first 2 + last 2 digits), bank name, phone_hash, counts, statuses, dates, account age.

## State machine

Happy path:
```
DRAF → DIAJUKAN → DISEPAKATI → DIBAYAR_DIKLAIM → DIKONFIRMASI_TERIMA → SELESAI
```

- `DRAF`: proposer filled form, link not yet opened. **Auto-delete after 7 days** (PII hygiene; walking away from an unformed deal is a right — no record survives).
- `DIAJUKAN`: counterpart opened link, entered phone. Declining here → record deleted, proposer privately notified. No public trace.
- `DISEPAKATI`: both parties passed the 4 attestations and accepted. Tier fee (if any) charged HERE, non-refundable. Hash anchored.
- `DIBAYAR_DIKLAIM`: payer uploaded bukti (attested), OCR ran. This is a CLAIM — rung 0 language everywhere.
- `DIKONFIRMASI_TERIMA`: payee confirmed receipt in-app. Deal is now rung-1 eligible. (Skippable — payee may ghost.)
- `SELESAI`: recipient of goods/repayment confirms fulfillment. Terminal, positive.

Exit states (D5 — all terminal unless noted):
- `DIBATALKAN_BERSAMA`: either side proposes cancel, other accepts. Weight: none. Mandatory exit door.
- `DIBATALKAN_SEPIHAK_PRA_BAYAR`: one side cancels/ghosts after DISEPAKATI but before any payment claim. Recorded as its own category (this is HnR). Light weight.
- `DIKEMBALIKAN_PENUH`: after payment, seller exits honestly — uploads bukti refund (kind=REFUND), buyer confirms. Neutral-positive. **The refund screen MUST display the N8 warning (copy-id.md §4) — refund scams solicit additional transfers.**
- `TIDAK_DIPENUHI`: deadline passed after payment claim/confirmation, no delivery, no response within the 14-day hak jawab window → flag published at the correct rung. The heavy terminal state.
- `SENGKETA` (non-terminal): flagged party responds within 14 days disputing. Flag shows DISPUTED. Mid-dispute silence for 14 more days → recorded as "tidak merespons dalam 14 hari".

Extension (applies to ANY deal, any tier — deferred obligations are the norm in jastip/PO/loans):
- `PERPANJANGAN`: from DISEPAKATI / DIBAYAR_DIKLAIM / DIKONFIRMASI_TERIMA, either party proposes a new deadline; counterpart must accept. Event payload stores old + new deadline. Public record line: "Batas waktu diperpanjang ke [tgl], disepakati kedua pihak." Unlimited extensions, each witnessed. A deadline lapse during a pending un-accepted extension proposal still counts as lapse — acceptance is what moves the date.

## Breach → flag pipeline

1. Deadline lapses in an eligible state → SYSTEM event `TENGGAT_LEWAT`.
2. Reporter (the unpaid/undelivered party) files breach. **Filing is free at every tier but requires reporter OTP** (we pay ~Rp430) — every flag has a traceable reporter; serial false accusers become as visible as serial breachers.
3. Notification to the other party (WA utility template) opens the 14-day hak jawab window.
4. Window closes silent → flag publishes. Rung selection: bukti confirmed by counterpart earlier? rung 1 : rung 0. (Rung 2 reserved for open-banking roadmap.)
5. Flag lands on identifiers by tier: GRATIS → rekening (masked) + bank; LIMA_RIBU → + phone_hash; BERMETERAI → + verified-identity marker (never the NIK itself).

## Tier spec (locked)

| | GRATIS | LIMA_RIBU (Rp5.000/pihak) | BERMETERAI (Rp50.000/pihak) |
|---|---|---|---|
| Verifies | nothing about the person | both phones (WA OTP) | legal identity (Didit e-KYC) + phones |
| Payment | — | Midtrans **QRIS only** | QRIS preferred, VA allowed |
| Extra artifacts | — | — | e-meterai (mock in demo) + evidence-pack PDF |
| Everything else | identical: record, hash+OTS, all states, free breach filing, hak jawab, flag, check page, N8 warning | ← | ← |

Fee charged at DISEPAKATI, non-refundable, either party may pay for both (recorded — a seller paying both sides is a good-faith signal). Verification cannot be delegated: money can be paid by one party; OTP/e-KYC cannot.

## Profile page (public, per phone_hash or rekening)

Counts per outcome, never a score: selesai · dibatalkan bersama · dibatalkan sepihak pra-bayar (HnR) · dikembalikan penuh · tidak dipenuhi · sengketa aktif. Plus account age and verification level. Rendering a composite score, stars, or a safety color is FORBIDDEN — a score is a verdict wearing math.
