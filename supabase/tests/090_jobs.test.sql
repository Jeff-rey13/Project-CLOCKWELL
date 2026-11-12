-- Scheduled jobs (migration 0014): schedules exist, absences are private, the job caller is not exposed.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select is((select count(*)::int from cron.job where jobname in
  ('clockout-reminders', 'mark-absent', 'purge-media', 'leave-year-rollover')), 4, 'four hourly jobs are scheduled');
select has_column('public', 'attendance', 'clockout_reminded_at', 'reminders are recorded once per shift');
select is((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'absences'), true, 'absences has RLS');

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
declare p record;
begin
  perform set_config('role', 'none', true);
  select company_id, app_role into p from public.profiles where user_id = p_user;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'company_id', p.company_id, 'app_role', p.app_role, 'is_platform', false
  )::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into public.absences (company_id, user_id, work_date) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2020-01-02'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '2020-01-02');

select pg_temp.act_as('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.absences where user_id <> '20000000-0000-0000-0000-000000000001'), 0,
  'an employee sees only their own absences');
select pg_temp.act_as('20000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.absences where company_id <> '10000000-0000-0000-0000-000000000001'), 0,
  'HR sees no absences of other companies');
select throws_ok($$insert into public.absences (company_id, user_id, work_date)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2020-01-03')$$,
  '42501', null, 'the browser cannot write absences');
select throws_ok($$select private.call_job('mark-absent')$$, '42501', null, 'the browser cannot trigger jobs');

select * from finish();
rollback;
