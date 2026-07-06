-- 0017 — Vault offering terms (curator-supplied commercial metadata).
--
-- Replaces the static presentational map (app/src/config/vaultDisplay.ts):
-- manager identity, strategy statement, risk grade and the ILLUSTRATIVE
-- target APY range are set by the Underwriting Curator through the gated
-- API (EIP-191 signature + on-chain UNDERWRITING_CURATOR/OWNER role check).
-- RLS deny-by-default with NO policies, same posture as the other tables:
-- reads and writes go exclusively through service-role API routes.

create table if not exists public.vault_offering_terms (
  vault_address text primary key check (vault_address = lower(vault_address)),
  manager_name text not null check (char_length(manager_name) between 1 and 80),
  strategy_statement text not null check (char_length(strategy_statement) between 1 and 280),
  risk_grade text not null check (risk_grade in ('LOWER', 'MODERATE', 'HIGHER', 'HIGH')),
  target_apy_min_bps integer not null check (target_apy_min_bps >= 0),
  target_apy_max_bps integer not null check (target_apy_max_bps > 0 and target_apy_max_bps <= 5000),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check (target_apy_min_bps <= target_apy_max_bps)
);

alter table public.vault_offering_terms enable row level security;
-- Intentionally NO policies: deny-by-default. All access via service-role routes.

comment on table public.vault_offering_terms is
  'Curator-supplied vault offering terms (manager, strategy, risk grade, illustrative target APY). Writes gated by on-chain UNDERWRITING_CURATOR/OWNER role via API. Service-role only (RLS deny-by-default).';
