-- 0016 — Backfill visits for orphan event sessions.
--
-- Two real visitors produced behavioral events (the client tracker ran) but
-- no site_visits row: the middleware's fire-and-forget pageview hop dropped
-- them silently. The fix ships a client-side pageview fallback; this
-- migration reconstructs the lost visits from each orphan session's first
-- event so history is not understated. Geo/referrer/UA of those loads are
-- honestly unrecoverable (left null → shown as Unknown). Idempotent.

insert into public.site_visits (path, session_id, country, city, created_at)
select first_e.path, first_e.session_id, first_e.country, first_e.city, first_e.created_at
from (
  select distinct on (session_id) session_id, path, country, city, created_at
  from public.site_events
  order by session_id, created_at asc
) first_e
left join public.site_visits v on v.session_id = first_e.session_id
where v.session_id is null;
