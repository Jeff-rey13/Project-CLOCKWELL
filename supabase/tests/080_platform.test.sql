-- Platform console (migrations 0012, 0013): platform only, company-level facts only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
declare p record; platform boolean;
begin
  perform set_config('role', 'none', true);
  select company_id, app_role into p from public.profiles where user_id = p_user;
  select exists (select 1 from public.platform_admins where user_id = p_user) into platform;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated',
    'company_id', p.company_id, 'app_role', p.app_role, 'is_platform', coalesce(platform, false)
  )::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

select hasnt_function('public', 'platform_company_usage', array['uuid'], 'no usage function: the platform sees no activity of a company''s people');
select is(
  (select count(*)::int from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'platform_companies' and p.parameter_name = 'seats_used'),
  0, 'platform_companies returns no headcount');

select pg_temp.act_as('20000000-0000-0000-0000-000000000004');
select ok((select count(*) from public.platform_companies()) >= 2, 'platform sees every company');
select is(public.my_platform_role(), 'owner', 'platform role is known');
select is((select count(*)::int from public.profiles), 0, 'platform reads no profiles');
select is((select count(*)::int from public.attendance) + (select count(*)::int from public.leave_requests), 0,
  'platform reads no attendance or leave');

select pg_temp.act_as('20000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.platform_companies()$$, '42501', null, 'company HR cannot list companies');

select * from finish();
rollback;
