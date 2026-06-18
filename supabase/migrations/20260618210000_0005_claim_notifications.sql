-- 0005 — Claim notifications (Claims Control Room, sub-project 3).
--
-- In-app notification system: server-mediated, on-chain-truth-anchored,
-- delta-polled from a tiny indexer. Same posture as KYB/evidence:
--   - RLS deny-by-default, no public policies
--   - all access via service-role server routes
--   - wallet-signature auth on read/mark-read
--
-- `notifications`        — one row per delivered event, per recipient address
-- `notification_state`   — last-observed on-chain status per (claim_id, recipient),
--                          so the refresh job can detect status transitions
-- `notification_prefs`   — per-address opt-in flags (in-app on by default,
--                          email reserved for a later phase)

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_addr text not null,            -- lowercase 0x address
  claim_id bigint not null,
  vault text not null,                     -- lowercase 0x vault address (denormalized for UI)
  kind text not null,                      -- 'status_change' | 'evidence_uploaded'
  from_status smallint,                    -- null for non-transitions (e.g. first sight, evidence)
  to_status smallint,
  message text not null,                   -- short, server-rendered, human-readable
  read_at timestamptz,                     -- null = unread
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_unread
  on public.notifications (recipient_addr, created_at desc)
  where read_at is null;

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_addr, created_at desc);

alter table public.notifications enable row level security;

comment on table public.notifications is
  'Per-recipient in-app notifications about claim events; service-role only (RLS deny-by-default).';

create table if not exists public.notification_state (
  claim_id bigint not null,
  recipient_addr text not null,
  last_status smallint not null,
  updated_at timestamptz not null default now(),
  primary key (claim_id, recipient_addr)
);

alter table public.notification_state enable row level security;

comment on table public.notification_state is
  'Indexer high-water mark per (claim, recipient) for status-change diffing.';

create table if not exists public.notification_prefs (
  address text primary key,                -- lowercase 0x
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  email text,                              -- reserved for a later phase
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

comment on table public.notification_prefs is
  'Per-address notification preferences. Privacy-by-default: email off until explicit opt-in.';
