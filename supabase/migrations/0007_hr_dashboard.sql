-- 0007: HR dashboard figures from one function (PRD 2.3), and Realtime for attendance.

-- Today's figures for the caller's company, in the company's time zone. HR of that company only.
create or replace function public.hr_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cid uuid := private.company_id();
  tz text;
  today date;
  result jsonb;
begin
  if not private.is_hr() or cid is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  select coalesce(timezone, 'Asia/Singapore') into tz from public.company_settings where company_id = cid;
  today := (now() at time zone coalesce(tz, 'Asia/Singapore'))::date;

  with staff as (
    select user_id from public.profiles where company_id = cid and status = 'active'
  ),
  shifts as (
    select a.* from public.attendance a
    join staff s on s.user_id = a.user_id
    where a.company_id = cid and a.work_date = today
  ),
  leave_today as (
    select distinct r.user_id from public.leave_requests r
    join staff s on s.user_id = r.user_id
    where r.company_id = cid and r.status = 'approved' and today between r.start_date and r.end_date
  )
  select jsonb_build_object(
    'date', today,
    'headcount', (select count(*) from staff),
    'in_today', (select count(distinct user_id) from shifts),
    'in_now', (select count(distinct user_id) from shifts where clock_out_at is null),
    'in_office', (select count(distinct user_id) from shifts where clock_out_at is null and clock_in_place = 'site'),
    'on_leave', (select count(*) from leave_today),
    'not_clocked_in', (select count(*) from staff s
                        where not exists (select 1 from shifts x where x.user_id = s.user_id)
                          and not exists (select 1 from leave_today l where l.user_id = s.user_id)),
    'late', (select count(distinct user_id) from shifts where status = 'late'),
    'flagged', (select count(distinct user_id) from shifts where 'outside_zone' = any(flags))
  ) into result;
  return result;
end $$;

revoke all on function public.hr_dashboard() from public, anon;
grant execute on function public.hr_dashboard() to authenticated;

-- Realtime: clients receive attendance changes they are allowed to read (RLS applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.attendance;
  end if;
end $$;
