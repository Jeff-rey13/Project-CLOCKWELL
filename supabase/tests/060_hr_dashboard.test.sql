-- HR dashboard function (migration 0007).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

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

-- Close any open shifts and add one late, flagged shift today for aisyah.
update public.attendance set clock_out_at = clock_in_at + interval '1 minute' where clock_out_at is null;
insert into public.attendance (company_id, user_id, office_id, work_date, clock_in_at, clock_in_place, status, flags, client_request_id)
values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        (now() at time zone 'Asia/Singapore')::date, now(), 'outside', 'late', '{outside_zone}', gen_random_uuid());

select pg_temp.act_as('20000000-0000-0000-0000-000000000002');
select is((public.hr_dashboard() ->> 'headcount')::int, 2, 'HR sees own company headcount only');
select ok((public.hr_dashboard() ->> 'late')::int >= 1, 'late shift counted');
select ok((public.hr_dashboard() ->> 'flagged')::int >= 1, 'flagged shift counted');
select is((public.hr_dashboard() ->> 'in_now')::int, 1, 'open shift counted as in now');

select pg_temp.act_as('20000000-0000-0000-0000-000000000001');
select throws_ok($$select public.hr_dashboard()$$, '42501', null, 'an employee cannot read the dashboard');

select * from finish();
rollback;
