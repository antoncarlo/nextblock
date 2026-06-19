-- 0008 — Cedant profile (Pilot Readiness gap #2).
--
-- Extends the existing KYB application surface with cedant-specific
-- underwriting data that the Curator needs to size the dedicated vault
-- (annual ceded premium, capacity ask, policy types, geographic scope)
-- and the post-approval onboarding orchestrator needs to track which
-- vault was provisioned for the cedant.
--
-- Modeled as a separate table (1:1 with kyb_applications when
-- applicant_type='cedant') instead of more columns on kyb_applications
-- so the curator KYB path stays unchanged.
--
-- RLS deny-by-default; service-role only — same posture as kyb_*.

create table if not exists public.cedant_profiles (
  application_id uuid primary key references public.kyb_applications(id) on delete cascade,
  -- High-level lines of business ceded into NextBlock. Free-text array; the
  -- form constrains to a curated picklist client-side (cat / motor / cyber /
  -- marine / etc.) but we keep the column open for unusual sub-lines.
  policy_types text[] not null default '{}',
  -- ISO-3166 alpha-2 codes the cedant writes risk in.
  geo_scope text[] not null default '{}',
  -- Order-of-magnitude band for annual ceded premium. Buckets keep the
  -- field instructional (no false precision pre-due-diligence).
  -- '<1M' | '1M-10M' | '10M-50M' | '50M-200M' | '>200M'
  annual_premium_band text,
  -- Capacity the cedant wants their dedicated vault to back, in USDC
  -- (decimals 6). Self-declared; Curator approves a real cap separately.
  expected_ceded_capacity_usdc bigint,
  -- Dedicated vault address provisioned by the Curator after approval.
  -- Lowercase 0x; set once the createVault tx lands. Null until then.
  primary_vault_address text check (
    primary_vault_address is null
    or primary_vault_address ~ '^0x[0-9a-f]{40}$'
  ),
  vault_provisioned_at timestamptz,
  vault_provisioned_by text check (
    vault_provisioned_by is null
    or vault_provisioned_by ~ '^0x[0-9a-f]{40}$'
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cedant_profiles enable row level security;

comment on table public.cedant_profiles is
  '1:1 extension of kyb_applications for applicant_type=cedant: underwriting metadata + provisioned vault address. Service-role only (RLS deny-by-default).';

create index if not exists idx_cedant_profiles_vault on public.cedant_profiles (primary_vault_address)
  where primary_vault_address is not null;
