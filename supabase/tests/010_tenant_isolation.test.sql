-- Tenant isolation (PRD section 9, first bullet).
-- Company A = harbourline, company B = meridian. Uses the ids fixed in seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Act as a seeded user: set the claims the access token hook adds, then drop to `authenticated`.
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

create function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Ground truth read as the owner, so counts do not depend on rows added during local use.
select set_config('t.att_aisyah', (select count(*) from public.attendance
  where user_id = '20000000-0000-0000-0000-000000000001')::text, true);
select set_config('t.att_a', (select count(*) from public.attendance
  where company_id = '10000000-0000-0000-0000-000000000001')::text, true);

-- ---------------------------------------------------------------- structure
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'RLS is enabled on every public table');

-- ---------------------------------------------------------------- employee of A (aisyah)
select pg_temp.act_as('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.profiles), 1, 'employee reads only own profile');
select is((select count(*)::int from public.attendance), current_setting('t.att_aisyah')::int,
  'employee reads only own attendance');
select is((select count(*)::int from public.employee_rules), 1, 'employee reads only own rules');
select is((select count(*)::int from public.offices), 2, 'employee reads own company offices only');
select is((select count(*)::int from public.sites), 2, 'employee reads own company sites only');
select is((select count(*)::int from public.companies), 1, 'employee reads own company row only');
select is(
  (select count(*)::int from public.attendance where company_id = '10000000-0000-0000-0000-000000000002'),
  0, 'employee of A sees no attendance of B');
select throws_ok(
  $$insert into public.attendance (company_id, user_id, work_date, clock_in_place, status, client_request_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
            '2026-11-05', 'site', 'on_time', gen_random_uuid())$$,
  '42501', null, 'employee cannot insert attendance directly');
select throws_ok(
  $$update public.profiles set full_name = 'x' where user_id = '20000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'employee cannot update profiles (own company or other)');
select throws_ok(
  $$delete from public.attendance$$,
  '42501', null, 'employee cannot delete attendance');

-- ---------------------------------------------------------------- HR of A (meiling)
select pg_temp.act_as('20000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.profiles), 2, 'HR reads all profiles in own company');
select is((select count(*)::int from public.employee_rules), 2, 'HR reads all rules in own company');
select is(
  (select count(*)::int from public.attendance), current_setting('t.att_a')::int,
  'HR reads all attendance of own company and nothing else');
select is(
  (select count(*)::int from public.attendance where company_id = '10000000-0000-0000-0000-000000000002'),
  0, 'HR of A sees no attendance of B');
select throws_ok(
  $$update public.offices set name = 'x' where company_id = '10000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'HR of A cannot update offices of B');

-- ---------------------------------------------------------------- employee of B (kenneth)
select pg_temp.act_as('20000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.profiles), 1, 'employee of B reads only own profile');
select is(
  (select count(*)::int from public.offices where company_id = '10000000-0000-0000-0000-000000000001'),
  0, 'employee of B sees no offices of A');
select is(
  (select count(*)::int from public.attendance where company_id = '10000000-0000-0000-0000-000000000001'),
  0, 'employee of B sees no attendance of A');
select is((select count(*)::int from public.companies), 1, 'employee of B reads own company row only');

-- ---------------------------------------------------------------- platform user without a grant (ops)
select pg_temp.act_as('20000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.profiles), 0, 'platform reads no profiles without a grant');
select is((select count(*)::int from public.attendance), 0, 'platform reads no attendance without a grant');
select is((select count(*)::int from public.companies), 2, 'platform reads company rows');
select is(
  private.has_support_grant('10000000-0000-0000-0000-000000000001'),
  false, 'no active support grant for A');

-- ---------------------------------------------------------------- anonymous
select pg_temp.act_as_anon();
select is((select count(*)::int from public.resolve_company('harbourline')), 1, 'anon can resolve a company by slug');
select is((select count(*)::int from public.companies), 0, 'anon reads no companies');
select is((select count(*)::int from public.profiles), 0, 'anon reads no profiles');

-- ---------------------------------------------------------------- access token hook
select pg_temp.reset();
select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', '20000000-0000-0000-0000-000000000001', 'claims', '{"role":"authenticated"}'::jsonb
  )) #>> '{claims,app_role}',
  'employee', 'hook adds app_role and keeps the built-in role claim');
select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', '20000000-0000-0000-0000-000000000004', 'claims', '{}'::jsonb
  )) #>> '{claims,is_platform}',
  'true', 'hook marks platform admins');

select * from finish();
rollback;
