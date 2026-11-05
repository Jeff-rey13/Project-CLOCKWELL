-- 0001 core: companies, people, places, attendance, helpers, RLS, company resolution, access token hook.
-- Leave, claims, flags, audit and storage follow in later migrations.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.plan as enum ('starter', 'business', 'enterprise');
create type public.release_track as enum ('pilot', 'stable');
create type public.company_status as enum ('onboarding', 'trial', 'active', 'suspended', 'pending_deletion');
create type public.hosting as enum ('shared', 'dedicated');
create type public.app_role as enum ('employee', 'hr');
create type public.profile_status as enum ('invited', 'active', 'offboarded');
create type public.work_mode as enum ('onsite', 'hybrid', 'remote', 'field');
create type public.home_status as enum ('none', 'pending', 'approved');
create type public.clock_place as enum ('site', 'home', 'outside');
create type public.attendance_status as enum ('on_time', 'grace', 'late');
create type public.platform_role as enum ('owner', 'engineer', 'support');

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Platform and company tables
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  logo_path text,
  plan public.plan not null default 'starter',
  seat_limit int not null default 25 check (seat_limit >= 0),
  release_track public.release_track not null default 'stable',
  status public.company_status not null default 'onboarding',
  deletion_scheduled_at timestamptz,
  deletion_requested_by uuid,
  deletion_approved_by uuid,
  hosting public.hosting not null default 'shared',
  supabase_url text,
  supabase_publishable_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'Asia/Singapore',
  currency text not null default 'SGD',
  selfie_retention_days int not null default 90 check (selfie_retention_days between 1 and 3650),
  record_retention_days int not null default 730 check (record_retention_days between 30 and 3650),
  modules jsonb not null default '{"attendance":true,"leave":true,"claims":true,"payroll_export":false}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  reason text not null,
  ticket_ref text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at <= created_at + interval '7 days')
);
create index on public.support_grants (company_id);

-- ---------------------------------------------------------------------------
-- People and places
-- ---------------------------------------------------------------------------
create table public.offices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  work_mode public.work_mode not null default 'onsite',
  timezone text not null default 'Asia/Singapore',
  shift_start time not null default '09:00',
  shift_end time not null default '18:00',
  grace_minutes int not null default 5 check (grace_minutes between 0 and 120),
  home_days smallint[] not null default '{}',
  require_selfie bool not null default true,
  flag_outside bool not null default true,
  clockout_reminder bool not null default true,
  count_overtime bool not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  check (home_days <@ array[1,2,3,4,5,6,7]::smallint[])
);
create index on public.offices (company_id);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null,
  name text not null,
  lat numeric(9,6) not null check (lat between -90 and 90),
  lng numeric(9,6) not null check (lng between -180 and 180),
  radius_m int not null check (radius_m between 25 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, office_id) references public.offices(company_id, id) on delete cascade
);
create index on public.sites (company_id);
create index on public.sites (office_id);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_code text not null,
  full_name text not null,
  username text not null check (username ~ '^[a-z0-9._-]{2,60}$'),
  work_email text not null,
  app_role public.app_role not null default 'employee',
  department text,
  office_id uuid,
  start_date date,
  status public.profile_status not null default 'invited',
  offboarded_at timestamptz,
  privacy_ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, username),
  unique (company_id, employee_code),
  unique (company_id, user_id),
  foreign key (company_id, office_id) references public.offices(company_id, id)
);
create index on public.profiles (company_id);

create table public.employee_rules (
  user_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  work_mode_override public.work_mode,
  shift_start time,
  shift_end time,
  grace_minutes int check (grace_minutes between 0 and 120),
  home_days smallint[],
  home_lat numeric(9,6),
  home_lng numeric(9,6),
  home_radius_m int not null default 200 check (home_radius_m between 25 and 2000),
  home_status public.home_status not null default 'none',
  home_approved_by uuid,
  home_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, user_id) references public.profiles(company_id, user_id) on delete cascade
);
create index on public.employee_rules (company_id);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  office_id uuid,
  work_date date not null,
  clock_in_at timestamptz not null default now(),
  clock_in_device_at timestamptz,
  clock_in_lat numeric(9,6),
  clock_in_lng numeric(9,6),
  clock_in_accuracy_m numeric(8,1),
  clock_in_place public.clock_place not null,
  clock_in_site_id uuid references public.sites(id) on delete set null,
  clock_in_distance_m int,
  clock_in_selfie_path text,
  clock_out_at timestamptz,
  clock_out_device_at timestamptz,
  clock_out_lat numeric(9,6),
  clock_out_lng numeric(9,6),
  clock_out_accuracy_m numeric(8,1),
  clock_out_place public.clock_place,
  clock_out_site_id uuid references public.sites(id) on delete set null,
  clock_out_distance_m int,
  clock_out_selfie_path text,
  status public.attendance_status not null,
  flags text[] not null default '{}'
    check (flags <@ array['outside_zone','gps_weak','sent_late','not_home_day']),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id),
  unique (company_id, id),
  foreign key (company_id, user_id) references public.profiles(company_id, user_id) on delete cascade,
  check (clock_out_at is null or clock_out_at >= clock_in_at)
);
create index on public.attendance (company_id);
create index on public.attendance (user_id, work_date desc);
create unique index attendance_one_open_shift on public.attendance (user_id) where clock_out_at is null;

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['companies','company_settings','platform_admins','support_grants',
                           'offices','sites','profiles','employee_rules','attendance']
  loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Helper functions (claims come from the Custom Access Token Hook)
-- ---------------------------------------------------------------------------
create or replace function private.company_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select nullif(auth.jwt() ->> 'company_id', '')::uuid
$$;

create or replace function private.app_role() returns text
language sql stable security definer set search_path = '' as $$
  select auth.jwt() ->> 'app_role'
$$;

create or replace function private.is_platform() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'is_platform')::boolean, false)
$$;

create or replace function private.is_hr() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.app_role() = 'hr' and private.company_id() is not null
$$;

create or replace function private.has_support_grant(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_platform() and exists (
    select 1 from public.support_grants g
    where g.company_id = target and g.revoked_at is null and g.expires_at > now()
  )
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security. Reads only; every write goes through functions.
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.company_settings enable row level security;
alter table public.platform_admins enable row level security;
alter table public.support_grants enable row level security;
alter table public.offices enable row level security;
alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.employee_rules enable row level security;
alter table public.attendance enable row level security;

-- companies: own row for company users; all rows for platform
create policy companies_read_own on public.companies for select to authenticated
  using (id = private.company_id() or private.is_platform());

create policy company_settings_read_own on public.company_settings for select to authenticated
  using (company_id = private.company_id() or private.is_platform());

create policy platform_admins_read_self on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy support_grants_read on public.support_grants for select to authenticated
  using ((private.is_hr() and company_id = private.company_id()) or private.is_platform());

-- company reference data: everyone in the company reads
create policy offices_read on public.offices for select to authenticated
  using (company_id = private.company_id());
create policy sites_read on public.sites for select to authenticated
  using (company_id = private.company_id());

-- personal data: own rows, or HR of the same company
create policy profiles_read on public.profiles for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));
create policy employee_rules_read on public.employee_rules for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));
create policy attendance_read on public.attendance for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));

-- No insert/update/delete policies: the browser cannot write these tables.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Company resolution (public, returns only what the login screen needs)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_company(p_slug text)
returns table (
  company_id uuid,
  name text,
  logo_url text,
  status public.company_status,
  supabase_url text,
  supabase_publishable_key text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.logo_path, c.status,
         case when c.hosting = 'dedicated' then c.supabase_url end,
         case when c.hosting = 'dedicated' then c.supabase_publishable_key end
  from public.companies c
  where c.slug = lower(p_slug) and c.status <> 'pending_deletion'
$$;
revoke all on function public.resolve_company(text) from public;
grant execute on function public.resolve_company(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: adds company_id, app_role, is_platform.
-- Leaves the built-in `role` claim untouched.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (event ->> 'user_id')::uuid;
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  p record;
  platform boolean;
begin
  select pr.company_id, pr.app_role into p
  from public.profiles pr
  where pr.user_id = uid and pr.status <> 'offboarded';

  select exists (select 1 from public.platform_admins pa where pa.user_id = uid) into platform;

  claims := claims
    || jsonb_build_object('company_id', p.company_id)
    || jsonb_build_object('app_role', p.app_role)
    || jsonb_build_object('is_platform', coalesce(platform, false));

  return jsonb_set(event, '{claims}', claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles, public.platform_admins to supabase_auth_admin;
create policy profiles_auth_hook on public.profiles for select to supabase_auth_admin using (true);
create policy platform_admins_auth_hook on public.platform_admins for select to supabase_auth_admin using (true);
