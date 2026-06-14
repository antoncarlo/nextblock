-- KYB durable nonce and rate-limit state.
-- Author: Anton Carlo Santoro
--
-- IMPORTANT: this migration is VERSIONED ONLY. It must not be applied to the
-- remote Supabase project until the owner has reviewed it and explicitly
-- authorized the apply step.
--
-- Design notes:
--   * kyb_operator_nonces makes operator review signatures single-use across
--     serverless instances by persisting issued nonces in Postgres.
--   * kyb_rate_limit_windows centralizes KYB fixed-window throttling across
--     serverless instances. The API calls the RPC below using the server-only
--     service-role Supabase client.
--   * RLS is enabled with no anon/authenticated policies. Client roles cannot
--     read or mutate either table directly.

-- --- Operator nonce store ----------------------------------------------------

create table public.kyb_operator_nonces (
  operator_address text not null check (operator_address ~ '^0x[0-9a-f]{40}$'),
  nonce text not null check (nonce ~ '^[0-9a-f]{32}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (operator_address, nonce),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at)
);

comment on table public.kyb_operator_nonces is
  'Server-issued KYB operator nonces. Each (operator_address, nonce) pair can be consumed once for anti-replay protection.';

comment on column public.kyb_operator_nonces.operator_address is
  'Lowercase EVM address of the operator wallet that requested the nonce.';

comment on column public.kyb_operator_nonces.nonce is
  '128-bit random nonce encoded as 32 lowercase hexadecimal characters.';

create index kyb_operator_nonces_expires_idx
  on public.kyb_operator_nonces (expires_at);

create index kyb_operator_nonces_consumed_idx
  on public.kyb_operator_nonces (operator_address, consumed_at)
  where consumed_at is null;

-- --- Durable fixed-window rate limits --------------------------------------

create table public.kyb_rate_limit_windows (
  bucket text not null check (bucket ~ '^[a-z0-9:_-]{1,80}$'),
  subject text not null check (char_length(subject) between 1 and 200),
  window_start timestamptz not null,
  window_end timestamptz not null,
  request_count integer not null check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket, subject),
  check (window_end > window_start)
);

comment on table public.kyb_rate_limit_windows is
  'Durable fixed-window counters for KYB API throttling across serverless instances.';

create index kyb_rate_limit_windows_expires_idx
  on public.kyb_rate_limit_windows (window_end);

create or replace function public.kyb_consume_rate_limit(
  p_bucket text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  current_count integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_end timestamptz := now() + make_interval(secs => p_window_seconds);
  v_row public.kyb_rate_limit_windows%rowtype;
begin
  if p_bucket is null or p_bucket !~ '^[a-z0-9:_-]{1,80}$' then
    raise exception 'invalid KYB rate-limit bucket';
  end if;

  if p_subject is null or char_length(p_subject) < 1 or char_length(p_subject) > 200 then
    raise exception 'invalid KYB rate-limit subject';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'invalid KYB rate-limit limit';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'invalid KYB rate-limit window';
  end if;

  insert into public.kyb_rate_limit_windows (
    bucket,
    subject,
    window_start,
    window_end,
    request_count
  ) values (
    p_bucket,
    p_subject,
    v_now,
    v_window_end,
    0
  )
  on conflict (bucket, subject) do nothing;

  select *
    into v_row
    from public.kyb_rate_limit_windows
   where bucket = p_bucket
     and subject = p_subject
   for update;

  if v_row.window_end <= v_now then
    update public.kyb_rate_limit_windows
       set window_start = v_now,
           window_end = v_window_end,
           request_count = 1,
           updated_at = v_now
     where bucket = p_bucket
       and subject = p_subject
     returning * into v_row;

    allowed := true;
    retry_after_seconds := 0;
    current_count := v_row.request_count;
    reset_at := v_row.window_end;
    return next;
    return;
  end if;

  if v_row.request_count >= p_limit then
    allowed := false;
    retry_after_seconds := greatest(1, ceiling(extract(epoch from (v_row.window_end - v_now)))::integer);
    current_count := v_row.request_count;
    reset_at := v_row.window_end;
    return next;
    return;
  end if;

  update public.kyb_rate_limit_windows
     set request_count = request_count + 1,
         updated_at = v_now
   where bucket = p_bucket
     and subject = p_subject
   returning * into v_row;

  allowed := true;
  retry_after_seconds := 0;
  current_count := v_row.request_count;
  reset_at := v_row.window_end;
  return next;
end;
$$;

comment on function public.kyb_consume_rate_limit(text, text, integer, integer) is
  'Atomically consumes one KYB fixed-window rate-limit unit and returns whether the request is allowed.';

-- --- Row Level Security and privileges -------------------------------------

alter table public.kyb_operator_nonces enable row level security;
alter table public.kyb_rate_limit_windows enable row level security;

revoke all on table public.kyb_operator_nonces from anon, authenticated;
revoke all on table public.kyb_rate_limit_windows from anon, authenticated;
revoke all on function public.kyb_consume_rate_limit(text, text, integer, integer) from public;
revoke all on function public.kyb_consume_rate_limit(text, text, integer, integer) from anon, authenticated;
grant execute on function public.kyb_consume_rate_limit(text, text, integer, integer) to service_role;

-- No anon/authenticated policies are created by design. The server-side
-- Supabase service-role client is the only intended access path.
