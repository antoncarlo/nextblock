-- 0007 — Sanctions screening (Pilot Readiness gap #1).
--
-- We screen every onboarded entity (cedant and Institutional LP) against
-- sanctions lists / PEP / adverse media at KYB approval time, and re-screen
-- every approved entity monthly. Hits become Sentinel-review items; the
-- on-chain `setBlocked` / `setWhitelist` calls are only fired AFTER the
-- Sentinel decision is recorded here, so this table is the audit-of-truth
-- for "why is wallet X blocked".
--
-- Tables:
--   sanctions_screening_runs — append-only log of every screening call
--                              (initial + monthly re-screening); same posture
--                              as kyb_review_events
--   sanctions_matches        — open or resolved match records that require
--                              a Sentinel decision (false-positive vs
--                              true-match)
--
-- RLS deny-by-default. All access via service-role server routes.

create table if not exists public.sanctions_screening_runs (
  id uuid primary key default gen_random_uuid(),
  kyb_application_id uuid,                       -- nullable: rescreening can target arbitrary subjects
  subject_kind text not null,                    -- 'entity' (legal name) | 'individual' (beneficial owner)
  subject_name text not null,                    -- the queried legal name
  subject_country text,                          -- ISO-3166 alpha-2 when provided
  provider text not null,                        -- 'complyadvantage' | 'mock'
  provider_search_id text,                       -- provider-returned correlation id
  result_code text not null,                     -- 'clear' | 'match' | 'error'
  match_count integer not null default 0,
  raw_response jsonb,                            -- truncated provider response for audit (no PII beyond name)
  ts timestamptz not null default now()
);

create index if not exists idx_sanctions_runs_kyb on public.sanctions_screening_runs (kyb_application_id, ts desc);

alter table public.sanctions_screening_runs enable row level security;

comment on table public.sanctions_screening_runs is
  'Append-only audit of every sanctions screening call (initial + monthly re-screen). Service-role only (RLS deny-by-default).';

create table if not exists public.sanctions_matches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sanctions_screening_runs(id),
  kyb_application_id uuid,
  provider_match_id text not null,               -- provider-returned match id (e.g. CA `id`)
  matched_name text not null,
  sanctions_list text,                           -- 'OFAC-SDN' | 'EU-CFSP' | 'UN-1267' | 'HMT-UK' | 'PEP' | …
  severity text not null default 'unknown',      -- 'low' | 'medium' | 'high' | 'unknown'
  match_score numeric,                           -- provider similarity score 0..1 if available
  status text not null default 'pending_sentinel',  -- 'pending_sentinel' | 'false_positive' | 'true_match' | 'expired'
  resolved_by text,                              -- lowercase 0x address of the Sentinel who decided
  resolved_at timestamptz,
  resolution_note text,
  evidence jsonb,                                -- provider evidence fields (list, urls, aliases)
  created_at timestamptz not null default now()
);

create index if not exists idx_sanctions_matches_status_kyb
  on public.sanctions_matches (status, kyb_application_id);

alter table public.sanctions_matches enable row level security;

comment on table public.sanctions_matches is
  'Open / resolved sanctions match records awaiting (or completed by) Sentinel decision. status drives the on-chain action: false_positive → setWhitelist allowed; true_match → setBlocked fired and recorded.';
