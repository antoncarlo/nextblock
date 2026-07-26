-- 0015 — Internal analytics: geolocation on behavioral events.
--
-- "Where do people click from": the event beacon passes through Vercel like
-- any request, so the x-vercel-ip-country/city headers are available at
-- ingestion — store them on the event itself instead of forcing a session
-- join at query time. Backfills existing rows from their session's first
-- pageview. Same privacy posture as site_visits (coarse CDN geo only).

alter table public.site_events add column if not exists country text;
alter table public.site_events add column if not exists city text;

-- Backfill from the session's pageview geo (best effort, idempotent).
update public.site_events e
set country = v.country, city = v.city
from (
  select distinct on (session_id) session_id, country, city
  from public.site_visits
  order by session_id, created_at asc
) v
where e.session_id = v.session_id and e.country is null;
