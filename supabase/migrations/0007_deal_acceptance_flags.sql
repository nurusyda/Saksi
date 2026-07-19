-- Track each party's individual acceptance separately, so DIAJUKAN -> DISEPAKATI
-- can require both parties to consent (matches the already-locked DIAJUKAN status
-- copy, "Menunggu persetujuan kedua pihak" — awaiting approval from BOTH parties).
--
-- These two columns are a materialized cache, not a second source of truth: they
-- are only ever flipped by record_party_acceptance() (see the acceptance-RPC
-- migration) in the same transaction as the PROPOSER_ACCEPTED/COUNTERPART_ACCEPTED
-- deal_events row that is the actual tamper-evident record — same relationship
-- deals.status already has to the full event history.

alter table deals
  add column proposer_accepted boolean not null default false,
  add column counterpart_accepted boolean not null default false;
