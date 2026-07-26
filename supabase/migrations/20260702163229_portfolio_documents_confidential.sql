-- Re-application of 0012 (see 20260702000000_0012_portfolio_documents.sql).
--
-- This version exists in the remote history because 0012 was applied a second
-- time under a fresh stamp. It is recorded here rather than erased so the
-- directory stays a faithful record of what actually ran against the database.
--
-- Replaying it is harmless and always was: every statement below is idempotent
-- (`if not exists`, `on conflict do nothing`), which is the only reason the
-- double application changed nothing. Do not add non-idempotent statements to
-- this file.

create table if not exists public.portfolio_documents (
  id uuid primary key default gen_random_uuid(),
  document_hash text not null unique,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null,
  uploader_addr text not null,
  manifest_cid text not null,
  manifest_uri text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_portfolio_documents_uploader on public.portfolio_documents (uploader_addr);

alter table public.portfolio_documents enable row level security;

comment on table public.portfolio_documents is
  'Confidential portfolio documents (bordereau/treaty/SOV) metadata; bytes live in the private Storage bucket portfolio-documents, IPFS carries only the public integrity manifest. Service-role only (RLS deny-by-default).';

insert into storage.buckets (id, name, public)
values ('portfolio-documents', 'portfolio-documents', false)
on conflict (id) do nothing;
