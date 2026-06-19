-- 0006 — Claim audit trail (Claims Control Room, sub-project 4).
--
-- Off-chain, append-only mirror of every claim-lifecycle log emitted by
-- ClaimManager and ClaimReceipt on Base. RPC log retention is not guaranteed
-- indefinitely (especially across providers), so we persist a normalized
-- record per log for compliance/audit. This is strictly READ-ONLY data: rows
-- are written only by the service-role cron route, never by user-facing APIs,
-- never by the UI.
--
-- Tables:
--   claim_audit_trail — one row per (tx_hash, log_index); idempotent via
--                       the unique constraint, so re-runs of the indexer
--                       (re-orgs, retries, schedule overlap) are safe
--   audit_cursor      — last-scanned block per (chain_id, contract_addr) so
--                       the indexer resumes incrementally instead of scanning
--                       from genesis every run

create table if not exists public.claim_audit_trail (
  id uuid primary key default gen_random_uuid(),
  claim_id bigint not null,
  event_name text not null,
  block_number bigint not null,
  log_index integer not null,
  tx_hash text not null,
  contract_addr text not null,            -- lowercase 0x emitter
  actor text,                             -- lowercase 0x actor (signer / tx origin); nullable when not applicable
  data jsonb not null default '{}'::jsonb, -- normalized event args (bigint -> string, address lowercased)
  ts timestamptz not null default now(),  -- ingestion time (NOT the block time — that lives in `data.blockTimestamp` if provided)
  unique (tx_hash, log_index)
);

create index if not exists idx_claim_audit_trail_claim
  on public.claim_audit_trail (claim_id, block_number desc, log_index desc);

alter table public.claim_audit_trail enable row level security;

comment on table public.claim_audit_trail is
  'Immutable off-chain mirror of claim-lifecycle on-chain logs. Service-role only (RLS deny-by-default). One row per (tx_hash, log_index) — unique-constrained for idempotency.';

create table if not exists public.audit_cursor (
  chain_id integer not null,
  contract_addr text not null,           -- lowercase 0x
  last_block bigint not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, contract_addr)
);

alter table public.audit_cursor enable row level security;

comment on table public.audit_cursor is
  'Indexer high-water mark: last fully-scanned block per (chain_id, contract). The refresh job reads this, scans forward, and upserts on success.';
