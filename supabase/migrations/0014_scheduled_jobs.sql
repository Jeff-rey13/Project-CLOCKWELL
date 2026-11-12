-- 0014: scheduled jobs (PRD 3.4). pg_cron calls Edge Functions through pg_net every hour; each job
-- works out per company (in its time zone) whether there is anything to do, and is idempotent.
-- The function URL and the shared job secret come from Vault (names: project_url, cron_secret),
-- set per project at deploy time; they are never stored in the repository.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Absences found by mark-absent: an active employee with no clock-in on a working day,
-- not on approved leave and not a company holiday.
create table public.absences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  work_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date),
  foreign key (company_id, user_id) references public.profiles(company_id, user_id) on delete cascade
);
create index on public.absences (company_id, work_date);
create trigger touch_updated_at before update on public.absences
  for each row execute function private.touch_updated_at();

alter table public.absences enable row level security;
create policy absences_read on public.absences for select to authenticated
  using (company_id = private.company_id() and (user_id = auth.uid() or private.is_hr()));
revoke insert, update, delete on public.absences from anon, authenticated;
grant select on public.absences to authenticated;

-- One reminder per shift.
alter table public.attendance add column clockout_reminded_at timestamptz;

-- Calls a job function with the shared secret. Does nothing until both Vault secrets exist.
create or replace function private.call_job(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_secret';
  if base is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := base || '/functions/v1/' || p_name,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function private.call_job(text) from public, anon, authenticated;

-- Hourly, spread out so they do not all start at once.
select cron.schedule('clockout-reminders', '5 * * * *', $$select private.call_job('clockout-reminders')$$);
select cron.schedule('mark-absent', '20 * * * *', $$select private.call_job('mark-absent')$$);
select cron.schedule('purge-media', '35 * * * *', $$select private.call_job('purge-media')$$);
select cron.schedule('leave-year-rollover', '50 * * * *', $$select private.call_job('leave-year-rollover')$$);
