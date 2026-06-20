-- 0009 — AI assessor + bordereau attestation backend (Pilot Readiness gap #5).
--
-- These two tables decouple the OFF-CHAIN assessment/attestation generation
-- (cron / webhook / Sentinel-triggered) from the ON-CHAIN publish step
-- (AIAssessor.publishAssessment / BordereauOracle.proposeAssertion).
--
-- Why split: signing on-chain from a backend would require a server-held
-- private key — operationally heavy and adds a high-blast-radius secret.
-- Instead, the backend generates the payload + sourceHash + persists a
-- pending row; a Sentinel/Operator reviews it in /app/admin and fires the
-- on-chain tx from THEIR wallet (Safe). Once mined, the row is marked
-- 'published'.
--
-- Same posture as sanctions_matches: append-only audit + explicit on-chain
-- separation. RLS deny-by-default.

create table if not exists public.ai_assessments_pending (
  id uuid primary key default gen_random_uuid(),
  claim_id bigint not null,
  -- Scores in basis points (0..10000). Match the AIAssessor.publishAssessment
  -- ABI exactly — the publish UI reads these into the tx args 1:1.
  score_bps integer not null check (score_bps between 0 and 10000),
  anomaly_score_bps integer not null check (anomaly_score_bps between 0 and 10000),
  confidence_bps integer not null check (confidence_bps between 0 and 10000),
  -- Recommendation enum mirrors AIAssessor.Recommendation:
  --   0 = APPROVE | 1 = REVIEW | 2 = REJECT
  recommendation smallint not null check (recommendation between 0 and 2),
  -- USDC base units (6 decimals). The on-chain AI is purely advisory; the
  -- final approved amount is set by the Committee.
  recommended_amount numeric not null check (recommended_amount >= 0),
  -- 0x-prefixed keccak256 of the canonical payload that generated the
  -- assessment (raw provider response + claim id + timestamp). The on-chain
  -- evidence trail uses this to prove the assessment is unchanged from
  -- what the off-chain provider returned.
  source_hash text not null check (source_hash ~ '^0x[0-9a-f]{64}$'),
  -- Provider that produced the row, for audit. 'mock' | 'braino' | …
  provider text not null,
  raw_response jsonb,
  status text not null default 'pending_publish',  -- 'pending_publish' | 'published' | 'rejected' | 'expired'
  published_tx_hash text check (published_tx_hash is null or published_tx_hash ~ '^0x[0-9a-f]{64}$'),
  published_at timestamptz,
  published_by text check (published_by is null or published_by ~ '^0x[0-9a-f]{40}$'),
  rejection_note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_assess_pending_status
  on public.ai_assessments_pending (status, created_at desc);
create index if not exists idx_ai_assess_claim on public.ai_assessments_pending (claim_id);

alter table public.ai_assessments_pending enable row level security;

comment on table public.ai_assessments_pending is
  'AI claim assessments awaiting on-chain publish. Service-role only; the on-chain publishAssessment is a separate Sentinel/Oracle Safe tx.';

create table if not exists public.bordereau_assertions_pending (
  id uuid primary key default gen_random_uuid(),
  portfolio_id bigint not null,
  -- Mirrors BordereauOracle.AssertionType (0 = PREMIUM_BORDEREAU, 1 = …).
  -- Kept as smallint to track on-chain ABI changes via a single column edit.
  assertion_type smallint not null check (assertion_type >= 0),
  -- 0x-prefixed keccak256 of the bordereau file/payload.
  data_hash text not null check (data_hash ~ '^0x[0-9a-f]{64}$'),
  data_uri text not null,                  -- ipfs:// or supabase storage URL
  declared_amount numeric not null check (declared_amount >= 0),
  -- Wallet that submitted the bordereau (cedant ops account or backend cron).
  submitted_by text not null check (submitted_by ~ '^0x[0-9a-f]{40}$'),
  status text not null default 'pending_propose',  -- 'pending_propose' | 'proposed' | 'disputed' | 'finalized' | 'rejected'
  proposed_tx_hash text check (proposed_tx_hash is null or proposed_tx_hash ~ '^0x[0-9a-f]{64}$'),
  proposed_at timestamptz,
  proposed_by text check (proposed_by is null or proposed_by ~ '^0x[0-9a-f]{40}$'),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_bordereau_pending_status
  on public.bordereau_assertions_pending (status, created_at desc);
create index if not exists idx_bordereau_portfolio on public.bordereau_assertions_pending (portfolio_id);

alter table public.bordereau_assertions_pending enable row level security;

comment on table public.bordereau_assertions_pending is
  'Bordereau assertion drafts awaiting on-chain proposeAssertion. Service-role only.';
