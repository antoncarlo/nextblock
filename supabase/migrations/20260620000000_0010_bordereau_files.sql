-- 0010 — Bordereau file storage (Batch A — finishing the bordereau lifecycle).
--
-- Sub-project 5 added the bordereau_assertions_pending table for off-chain
-- drafts awaiting on-chain proposeAssertion. What was missing: a place to
-- store the actual bordereau file the dataHash refers to.
--
-- Mirrors the claim-evidence pattern from 0004: a private Storage bucket
-- (only short-lived signed URLs are issued to authorized readers) plus a
-- metadata table joined to the existing bordereau_assertions_pending.
--
-- RLS deny-by-default; service-role only.

create table if not exists public.bordereau_files (
  id uuid primary key default gen_random_uuid(),
  assertion_id uuid not null references public.bordereau_assertions_pending(id) on delete cascade,
  storage_path text not null,
  content_hash text not null check (content_hash ~ '^0x[0-9a-f]{64}$'),   -- 0x keccak256 of bytes
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  uploader_addr text not null check (uploader_addr ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz not null default now()
);

create index if not exists idx_bordereau_files_assertion
  on public.bordereau_files (assertion_id);

alter table public.bordereau_files enable row level security;

comment on table public.bordereau_files is
  'Bordereau file metadata; the file bytes live in the private Storage bucket bordereau-files. Service-role only (RLS deny-by-default).';

-- Private storage bucket for the bordereau payloads.
insert into storage.buckets (id, name, public)
values ('bordereau-files', 'bordereau-files', false)
on conflict (id) do nothing;
