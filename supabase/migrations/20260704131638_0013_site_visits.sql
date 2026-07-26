-- 0013 — Internal analytics: page views (request level).
--
-- Written exclusively by the service-role /api/track/pageview route (fed by
-- the edge middleware, fire-and-forget). RLS deny-by-default with NO policies,
-- same posture as claim_evidence (0004): the anon key can never read or write
-- raw visit rows. Data stored: IP + Vercel geo headers + referrer/UA/path —
-- no personal data beyond that by design.

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  ip text,
  country text,
  city text,
  region text,
  referrer text,
  user_agent text,
  path text not null,
  session_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_site_visits_created_at on public.site_visits (created_at desc);
create index if not exists idx_site_visits_session on public.site_visits (session_id);
create index if not exists idx_site_visits_path on public.site_visits (path);

alter table public.site_visits enable row level security;
-- Intentionally NO policies: deny-by-default. All access via service-role routes.

comment on table public.site_visits is
  'Internal analytics page views (middleware-fed). Service-role only (RLS deny-by-default). No personal data beyond IP/geo/referrer/UA.';
