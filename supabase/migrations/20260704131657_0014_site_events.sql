-- 0014 — Internal analytics: behavioral events (interaction level).
--
-- Written exclusively by the service-role /api/track/event route, fed by the
-- client TrackerScript via navigator.sendBeacon. Three event kinds:
--   click        → section + element_text          (value_numeric null)
--   section_time → section + seconds visible       (value_numeric = seconds)
--   scroll       → max scroll-depth milestone      (value_numeric = 25|50|75|100)
-- RLS deny-by-default with NO policies (service-role only), like 0013.

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  path text not null,
  event_type text not null check (event_type in ('click', 'section_time', 'scroll')),
  section text,
  element_text text,
  value_numeric double precision,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_events_created_at on public.site_events (created_at desc);
create index if not exists idx_site_events_type on public.site_events (event_type);
create index if not exists idx_site_events_path on public.site_events (path);
create index if not exists idx_site_events_session on public.site_events (session_id);

alter table public.site_events enable row level security;
-- Intentionally NO policies: deny-by-default. All access via service-role routes.

comment on table public.site_events is
  'Internal analytics behavioral events (clicks, section dwell time, scroll depth). Service-role only (RLS deny-by-default).';
