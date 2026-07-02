-- 0012 — Confidential portfolio documents (bordereau / treaty / SOV).
--
-- Confidential-pinning mode: the document itself NEVER goes to IPFS (a CID is
-- world-readable and a bordereau carries insured-party data). The raw bytes
-- live in the PRIVATE Storage bucket `portfolio-documents`; what gets pinned
-- publicly is a small integrity MANIFEST (hash + non-sensitive metadata), and
-- the on-chain documentHash stays keccak256 of the real bytes.
--
-- Same posture as claim_evidence (0004): RLS deny-by-default with NO policies,
-- so the table is reachable only through the service-role server routes, which
-- enforce the on-chain authorization (AUTHORIZED_CEDANT_ROLE to upload;
-- Underwriting Curator / Owner — or the uploading cedant — to download).

create table if not exists public.portfolio_documents (
  id uuid primary key default gen_random_uuid(),
  document_hash text not null unique, -- 0x-prefixed keccak256 of the uploaded bytes (matches on-chain)
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploader_addr text not null,        -- lowercase 0x address recovered from the signature
  manifest_cid text not null,         -- IPFS CID of the PUBLIC integrity manifest
  manifest_uri text not null,         -- ipfs://<cid>
  created_at timestamptz not null default now()
);

create index if not exists idx_portfolio_documents_uploader on public.portfolio_documents (uploader_addr);

alter table public.portfolio_documents enable row level security;
-- Intentionally NO policies: deny-by-default. All access via service-role routes.

comment on table public.portfolio_documents is
  'Confidential portfolio documents (bordereau/treaty/SOV) metadata; bytes live in the private Storage bucket portfolio-documents, IPFS carries only the public integrity manifest. Service-role only (RLS deny-by-default).';

-- Private storage bucket for the documents (not public).
insert into storage.buckets (id, name, public)
values ('portfolio-documents', 'portfolio-documents', false)
on conflict (id) do nothing;
