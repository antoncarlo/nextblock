-- 0004 — Claim evidence storage metadata (Claims Control Room, sub-project 2).
--
-- Confidential claim evidence: the documents themselves live in the PRIVATE
-- Supabase Storage bucket `claim-evidence`. This table holds only metadata plus
-- the keccak256 content hash (which the UI verifies against the on-chain
-- `evidenceHash`). RLS is deny-by-default: there are NO policies, so the table
-- is reachable only through the service-role server routes, which enforce the
-- on-chain authorization (claimant for upload; Claims Committee / Sentinel /
-- Owner — or the claimant — for read). The frontend is never the boundary.

create table if not exists public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id bigint not null,
  storage_path text not null,
  content_hash text not null,     -- 0x-prefixed keccak256 of the uploaded bytes
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploader_addr text not null,    -- lowercase 0x address recovered from the signature
  created_at timestamptz not null default now()
);

create index if not exists idx_claim_evidence_claim_id on public.claim_evidence (claim_id);

alter table public.claim_evidence enable row level security;
-- Intentionally NO policies: deny-by-default. All access via service-role routes.

comment on table public.claim_evidence is
  'Confidential claim evidence metadata; documents live in the private Storage bucket claim-evidence. Service-role only (RLS deny-by-default).';

-- Private storage bucket for the documents (not public).
insert into storage.buckets (id, name, public)
values ('claim-evidence', 'claim-evidence', false)
on conflict (id) do nothing;
