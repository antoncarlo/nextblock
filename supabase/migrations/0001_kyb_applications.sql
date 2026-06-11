-- NextBlock KYB/KYC instructional pipeline (P0A).
-- Author: Anton Carlo Santoro
--
-- IMPORTANT: this migration is VERSIONED ONLY. It must not be applied to the
-- remote Supabase project until the owner has reviewed it and explicitly
-- authorized the apply step.
--
-- Design notes:
--   * The database is the instructional (off-chain) record of KYB/KYC review.
--     Approval here NEVER writes the on-chain ComplianceRegistry whitelist:
--     that remains a separate, explicitly authorized act of the KYC Operator.
--   * RLS is enabled deny-by-default on both tables. The Next.js route
--     handlers use the service-role key (server only), which bypasses RLS by
--     design; the policies below exist so that the anon/authenticated roles
--     can do strictly nothing beyond the single allowed insert path.
--   * kyb_review_events is append-only: no UPDATE/DELETE policy exists for
--     any non-service role, preserving the audit trail.
--   * No seed data: real or illustrative rows are both forbidden here.

-- --- Status enum -------------------------------------------------------------

create type public.kyb_status as enum (
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'needs_info'
);

create type public.kyb_applicant_type as enum ('cedant', 'curator');

-- --- Applications ------------------------------------------------------------

create table public.kyb_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_type public.kyb_applicant_type not null,
  -- EVM address, checksummed or lowercase; format enforced here, semantics
  -- (signature ownership) verified at the API layer.
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  company_name text not null check (char_length(company_name) between 2 and 200),
  legal_entity_type text not null check (char_length(legal_entity_type) between 1 and 100),
  jurisdiction text not null check (char_length(jurisdiction) between 2 and 100),
  license_number text check (char_length(license_number) <= 100),
  -- Self-declared figure (portfolio size / AUM). Free text. Never a metric.
  declared_portfolio text check (char_length(declared_portfolio) <= 200),
  contact_name text not null check (char_length(contact_name) between 2 and 200),
  contact_email text not null check (char_length(contact_email) <= 320),
  website text check (char_length(website) <= 300),
  description text check (char_length(description) <= 4000),
  status public.kyb_status not null default 'submitted',
  chain_id integer not null default 84532 check (chain_id = 84532),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kyb_applications is
  'KYB/KYC onboarding applications (instructional record; on-chain whitelist is a separate authorized act).';

-- One ACTIVE (non-terminal) application per wallet+type: resubmission is
-- possible only after a terminal outcome.
create unique index kyb_applications_active_unique
  on public.kyb_applications (lower(wallet_address), applicant_type)
  where status in ('submitted', 'under_review', 'needs_info');

create index kyb_applications_status_idx on public.kyb_applications (status);
create index kyb_applications_wallet_idx on public.kyb_applications (lower(wallet_address));
create index kyb_applications_type_idx on public.kyb_applications (applicant_type);
create index kyb_applications_created_idx on public.kyb_applications (created_at desc);

-- updated_at maintenance.
create or replace function public.kyb_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger kyb_applications_touch
  before update on public.kyb_applications
  for each row execute function public.kyb_touch_updated_at();

-- --- Review audit trail (append-only) ---------------------------------------

create table public.kyb_review_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.kyb_applications (id) on delete restrict,
  -- Operator wallet that signed the review action (verified at API layer
  -- against on-chain KYC_OPERATOR_ROLE / OWNER_ROLE membership).
  actor_address text not null check (actor_address ~ '^0x[0-9a-fA-F]{40}$'),
  from_status public.kyb_status not null,
  to_status public.kyb_status not null,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.kyb_review_events is
  'Append-only audit trail of KYB review transitions. No update/delete policies exist by design.';

create index kyb_review_events_app_idx on public.kyb_review_events (application_id, created_at);

-- --- Row Level Security: deny by default ------------------------------------

alter table public.kyb_applications enable row level security;
alter table public.kyb_review_events enable row level security;

-- No SELECT/UPDATE/DELETE policy is defined for anon or authenticated on
-- either table: PII never leaves the server path (service-role handlers).
--
-- Single allowed direct path: anon INSERT of a fresh application in state
-- 'submitted'. Kept so the public apply form works even if routed without the
-- service client; the API still validates payloads with zod before inserting.
create policy kyb_applications_insert_submitted
  on public.kyb_applications
  for insert
  to anon
  with check (status = 'submitted' and chain_id = 84532);

-- kyb_review_events: intentionally NO policy at all for anon/authenticated.
-- Only the service role (server) can read or append audit events.
