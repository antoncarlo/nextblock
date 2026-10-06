-- 0018 — A screening run by the fixture provider is not evidence.
--
-- Until 2026-10-05 the screening provider defaulted to a deterministic fixture that
-- answers "clear" to every name and every wallet. All 49 runs recorded between July
-- and October 2026 (42 entities, 7 wallets) came from it, so the audit log holds "clear"
-- results for subjects that were never checked against anything.
--
-- The rows stay: the log is an audit and nothing is deleted from it. They are marked
-- as not evidential, and a trigger keeps any run by the fixture provider that way, so
-- no reader that asks "has this subject been screened?" can count one again. The
-- fixture is refused on production now; this closes the history it left behind.

alter table public.sanctions_screening_runs
  add column if not exists evidential boolean not null default true;

comment on column public.sanctions_screening_runs.evidential is
  'false = the run came from the fixture provider and proves nothing about the subject. Readers that report screening status must filter on evidential = true.';

create or replace function public.sanctions_runs_set_evidential()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider = 'mock' then
    new.evidential := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sanctions_runs_evidential on public.sanctions_screening_runs;
create trigger trg_sanctions_runs_evidential
  before insert or update of provider, evidential on public.sanctions_screening_runs
  for each row execute function public.sanctions_runs_set_evidential();

-- The history: every run by the fixture provider.
update public.sanctions_screening_runs set evidential = false where provider = 'mock';

create index if not exists idx_sanctions_runs_kyb_evidential
  on public.sanctions_screening_runs (kyb_application_id, ts desc)
  where evidential;
