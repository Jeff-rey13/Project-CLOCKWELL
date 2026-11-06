-- 0002: rest of the data model (PRD section 4): platform tables, audit log, holidays, corrections,
-- attendance_effective view, leave, claims, RLS and storage buckets.

create type public.actor_type as enum ('employee', 'hr', 'platform', 'system');
create type public.release_stage as enum ('staging', 'pilot', 'all', 'rolled_back');
create type public.correction_field as enum ('clock_in', 'clock_out');
create type public.correction_reason as enum ('device_delay', 'forgot', 'manager_approved', 'other');
create type public.decision_status as enum ('pending', 'approved', 'rejected');
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- ---------------------------------------------------------------------------
-- Platform tables
-- ---------------------------------------------------------------------------
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9_.]{2,80}$'),
  company_id uuid references public.companies(id) on delete cascade,
  enabled bool not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (key, company_id)
);
create index on public.feature_flags (company_id);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  stage public.release_stage not null,
  github_run_id text,
  started_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid,
  actor_type public.actor_type not null,
  action text not null,
  target_table text,
  target_id text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_log (company_id, created_at desc);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, date)
);
create index on public.holidays (company_id);

-- ---------------------------------------------------------------------------
-- Attendance corrections and the effective view
-- ---------------------------------------------------------------------------
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  attendance_id uuid not null,
  field public.correction_field not null,
  original_at timestamptz,
  corrected_at timestamptz not null,
  reason_code public.correction_reason not null,
  note text check (char_length(note) <= 500),
  requested_by uuid not null,
  decided_by uuid,
  status public.decision_status not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, attendance_id) references public.attendance(company_id, id) on delete cascade
);
create index on public.attendance_corrections (company_id);
create index on public.attendance_corrections (attendance_id);

-- Reads respect the caller's RLS (security_invoker). Original server times are never edited.
create view public.attendance_effective with (security_invoker = true) as
select
  a.*,
  coalesce(ci.corrected_at, a.clock_in_at) as effective_clock_in_at,
  coalesce(co.corrected_at, a.clock_out_at) as effective_clock_out_at,
  (ci.id is not null or co.id is not null) as is_corrected
from public.attendance a
left join lateral (
  select c.id, c.corrected_at from public.attendance_corrections c
  where c.attendance_id = a.id and c.field = 'clock_in' and c.status = 'approved'
  order by c.decided_at desc limit 1
) ci on true
left join lateral (
  select c.id, c.corrected_at from public.attendance_corrections c
  where c.attendance_id = a.id and c.field = 'clock_out' and c.status = 'approved'
  order by c.decided_at desc limit 1
) co on true;

-- ---------------------------------------------------------------------------
-- Leave and claims
-- ---------------------------------------------------------------------------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]{2,20}$'),
  name text not null,
  days_per_year numeric(4,1) not null default 0 check (days_per_year >= 0),
  requires_attachment bool not null default false,
  is_paid bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code),
  unique (company_id, id)
);
create index on public.leave_types (company_id);

create table public.leave_balances (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  leave_type_id uuid not null,
  year int not null check (year between 2000 and 2100),
  entitled numeric(4,1) not null check (entitled >= 0),
  used numeric(4,1) not null default 0 check (used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, leave_type_id, year),
  check (used <= entitled),
  foreign key (company_id, user_id) references public.profiles(company_id, user_id) on delete cascade,
  foreign key (company_id, leave_type_id) references public.leave_types(company_id, id) on delete cascade
);
create index on public.leave_balances (company_id);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  leave_type_id uuid not null,
  start_date date not null,
  end_date date not null,
  half_day_end bool not null default false,
  days numeric(4,1) not null check (days > 0),
  reason text check (char_length(reason) <= 500),
  attachment_path text,
  status public.leave_status not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id),
  check (end_date >= start_date),
  foreign key (company_id, user_id) references public.profiles(company_id, user_id) on delete cascade,
  foreign key (company_id, leave_type_id) references public.leave_types(company_id, id)
);
create index on public.leave_requests (company_id);
create index on public.leave_requests (user_id, start_date desc);

create table public.claim_policies (
  company_id uuid not null references public.companies(id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  annual_limit numeric(10,2) not null check (annual_limit >= 0),
  per_claim_limit numeric(10,2) check (per_claim_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, year)
);

create table public.medical_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  clinic text not null check (char_length(clinic) between 1 and 120),
  visit_date date not null,
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'SGD',
  receipt_paths text[] not null default '{}',
  status public.decision_status not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (char_length(decision_note) <= 500),
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id),
  foreign key (company_id, user_id) references public.profiles(company_id, user_id) on delete cascade
);
create index on public.medical_claims (company_id);
create index on public.medical_claims (user_id, visit_date desc);

do $$
declare t text;
begin
  foreach t in array array['feature_flags','platform_settings','releases','holidays','attendance_corrections',
                           'leave_types','leave_balances','leave_requests','claim_policies','medical_claims']
  loop
    execute format('create trigger touch_updated_at before update on public.%I
                    for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security (reads only; writes go through functions)
-- ---------------------------------------------------------------------------
alter table public.feature_flags enable row level security;
alter table public.platform_settings enable row level security;
alter table public.releases enable row level security;
alter table public.audit_log enable row level security;
alter table public.holidays enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.claim_policies enable row level security;
alter table public.medical_claims enable row level security;

create policy feature_flags_read on public.feature_flags for select to authenticated
  using (company_id is null or company_id = private.company_id() or private.is_platform());

create policy platform_settings_read on public.platform_settings for select to authenticated
  using (true); -- platform table, no company data (only version numbers)

create policy releases_read on public.releases for select to authenticated
  using (private.is_platform());

create policy audit_log_read on public.audit_log for select to authenticated
  using ((private.is_hr() and company_id = private.company_id()) or private.is_platform());

-- company reference data: everyone in the company reads
create policy holidays_read on public.holidays for select to authenticated
  using (company_id = private.company_id());
create policy leave_types_read on public.leave_types for select to authenticated
  using (company_id = private.company_id());
create policy claim_policies_read on public.claim_policies for select to authenticated
  using (company_id = private.company_id());

-- personal data: own rows, or HR of the same company
create policy leave_balances_read on public.leave_balances for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));
create policy leave_requests_read on public.leave_requests for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));
create policy medical_claims_read on public.medical_claims for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));
create policy corrections_read on public.attendance_corrections for select to authenticated
  using (company_id = private.company_id() and (requested_by = auth.uid() or private.is_hr()));

revoke insert, update, delete on all tables in schema public from anon, authenticated;
revoke all on public.attendance_effective from anon;
grant select on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Storage (PRD 3.3). Paths start with {company_id}/{user_id}/...
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('selfies', 'selfies', false, 1048576, array['image/webp', 'image/jpeg']),
  ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf']),
  ('logos', 'logos', true, 1048576, array['image/png', 'image/svg+xml']),
  ('exports', 'exports', false, 524288000, array['application/zip'])
on conflict (id) do nothing;

create policy media_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id in ('selfies', 'receipts')
    and (storage.foldername(name))[1] = private.company_id()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy media_read on storage.objects for select to authenticated
  using (
    bucket_id in ('selfies', 'receipts')
    and (storage.foldername(name))[1] = private.company_id()::text
    and ((storage.foldername(name))[2] = auth.uid()::text or private.is_hr())
  );

create policy logos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and private.is_hr()
              and (storage.foldername(name))[1] = private.company_id()::text);
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'logos' and private.is_hr()
         and (storage.foldername(name))[1] = private.company_id()::text);
-- exports: no browser policies; created by a function and read through signed URLs.
