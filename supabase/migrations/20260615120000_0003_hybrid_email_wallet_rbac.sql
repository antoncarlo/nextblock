-- Hybrid email + wallet RBAC for NextBlock admin/KYB operations.
-- This migration is intentionally app-level: it does not grant on-chain roles
-- and does not replace ProtocolRoles/ComplianceRegistry for transactions.

do $$ begin
  create type public.app_access_role as enum (
    'admin',
    'kyb_operator',
    'reviewer',
    'support'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_user_roles (
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.app_access_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role)
);

create table if not exists public.app_user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  wallet_address text not null,
  label text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint app_user_wallets_evm_address check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  unique (user_id, wallet_address)
);

create unique index if not exists app_user_wallets_one_primary_per_user
  on public.app_user_wallets(user_id)
  where is_primary;

alter table public.app_users enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.app_user_wallets enable row level security;

-- Users may inspect their own app profile. All writes remain server-side via
-- service-role route handlers or explicit SQL run by a project owner.
do $$ begin
  create policy "app_users_select_own" on public.app_users
    for select using (auth.uid() = id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "app_user_roles_select_own" on public.app_user_roles
    for select using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "app_user_wallets_select_own" on public.app_user_wallets
    for select using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

-- Optional audit metadata for email-based reviews. The existing actor_address
-- field remains populated for wallet reviews; email reviews can write a stable
-- actor_address alias while also storing structured actor metadata.
alter table public.kyb_review_events
  add column if not exists actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists actor_email text,
  add column if not exists actor_method text not null default 'wallet' check (actor_method in ('wallet', 'email'));

create index if not exists app_user_roles_role_idx on public.app_user_roles(role);
create index if not exists app_user_wallets_wallet_idx on public.app_user_wallets(lower(wallet_address));
create index if not exists kyb_review_events_actor_user_id_idx on public.kyb_review_events(actor_user_id);

-- Bootstrap allowlist requested for initial admin operations. Passwords are never
-- stored here: the user must still authenticate through Supabase Auth via email.
-- Once auth.users contains this email, the app profile, all app-level roles and
-- wallet links are created/updated automatically.
create or replace function public.nextblock_sync_authorized_app_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Hardening: roles are granted only to a CONFIRMED email (email_confirmed_at
  -- set by Supabase Auth). An unconfirmed signup with this address can never
  -- gain admin access; control of the confirmed inbox (plus MFA, configured in
  -- Supabase Auth) is the security boundary for this app-level admin.
  if lower(coalesce(new.email, '')) = 'antoncarlo1995@gmail.com'
     and new.email_confirmed_at is not null then
    insert into public.app_users (id, email, display_name, status)
    values (new.id, lower(new.email), 'Anton Carlo', 'active')
    on conflict (id) do update set
      email = excluded.email,
      display_name = coalesce(public.app_users.display_name, excluded.display_name),
      status = 'active',
      updated_at = now();

    insert into public.app_user_roles (user_id, role)
    values
      (new.id, 'admin'),
      (new.id, 'kyb_operator'),
      (new.id, 'reviewer'),
      (new.id, 'support')
    on conflict (user_id, role) do nothing;

    insert into public.app_user_wallets (user_id, wallet_address, label, is_primary)
    values
      (new.id, '0x6495280c365b372230A275C8Fec6724e3FC228dB', 'Operator/Admin wallet 0x6495', true),
      (new.id, '0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e', 'Operator/Admin wallet 0x810f', false)
    on conflict (user_id, wallet_address) do update set
      label = excluded.label,
      is_primary = excluded.is_primary;
  end if;

  return new;
end;
$$;

drop trigger if exists nextblock_sync_authorized_app_user on auth.users;
create trigger nextblock_sync_authorized_app_user
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.nextblock_sync_authorized_app_user();

-- Backfill if the Supabase Auth user already exists before this migration runs.
insert into public.app_users (id, email, display_name, status)
select id, lower(email), 'Anton Carlo', 'active'
from auth.users
where lower(email) = 'antoncarlo1995@gmail.com'
  and email_confirmed_at is not null
on conflict (id) do update set
  email = excluded.email,
  display_name = coalesce(public.app_users.display_name, excluded.display_name),
  status = 'active',
  updated_at = now();

insert into public.app_user_roles (user_id, role)
select u.id, r.role::public.app_access_role
from auth.users u
cross join (values ('admin'), ('kyb_operator'), ('reviewer'), ('support')) as r(role)
where lower(u.email) = 'antoncarlo1995@gmail.com'
  and u.email_confirmed_at is not null
on conflict (user_id, role) do nothing;

insert into public.app_user_wallets (user_id, wallet_address, label, is_primary)
select u.id, w.wallet_address, w.label, w.is_primary
from auth.users u
cross join (values
  ('0x6495280c365b372230A275C8Fec6724e3FC228dB', 'Operator/Admin wallet 0x6495', true),
  ('0x810fa6726eeB6014c2F77Bb4802A5734C28b0F3e', 'Operator/Admin wallet 0x810f', false)
) as w(wallet_address, label, is_primary)
where lower(u.email) = 'antoncarlo1995@gmail.com'
  and u.email_confirmed_at is not null
on conflict (user_id, wallet_address) do update set
  label = excluded.label,
  is_primary = excluded.is_primary;

comment on table public.app_users is 'Email-authenticated application users for NextBlock app-level RBAC.';
comment on table public.app_user_roles is 'Application roles used for UI/API access. On-chain writes still require wallet roles.';
comment on table public.app_user_wallets is 'Optional wallet links for display, audit correlation, and future delegated workflows.';
