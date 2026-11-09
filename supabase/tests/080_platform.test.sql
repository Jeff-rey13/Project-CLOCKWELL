-- Platform console functions (migration 0012): platform only, counts only.
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

select pg_temp.act_as('20000000-0000-0000-0000-000000000004');
select ok((select count(*) from public.platform_companies()) >= 2, 'platform sees every company');
select is((select seats_used from public.platform_companies() where slug = 'meridian')::int, 1, 'seat count is returned');
select ok((public.platform_company_usage('10000000-0000-0000-0000-000000000001') ? 'employees'), 'usage counts are returned');
select is(public.my_platform_role(), 'owner', 'platform role is known');
select is((select count(*)::int from public.profiles), 0, 'platform still reads no profiles');

select pg_temp.act_as('20000000-0000-0000-0000-000000000002');
select throws_ok($$select * from public.platform_companies()$$, '42501', null, 'company HR cannot list companies');
select throws_ok($$select public.platform_company_usage('10000000-0000-0000-0000-000000000002')$$, '42501', null,
  'company HR cannot read another company''s usage');

select * from finish();
rollback;
