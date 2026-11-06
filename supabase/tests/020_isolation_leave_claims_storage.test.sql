-- Isolation for the tables and storage added in migration 0002.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

-- A correction on aisyah's shift, and an audit row per company, created as the owner.
insert into public.attendance_corrections (company_id, attendance_id, field, original_at, corrected_at,
  reason_code, requested_by, status, decided_at)
select company_id, id, 'clock_in', clock_in_at, clock_in_at - interval '5 minutes', 'device_delay',
       user_id, 'approved', now()
from public.attendance where user_id = '20000000-0000-0000-0000-000000000001';
insert into public.audit_log (company_id, actor_type, action) values
  ('10000000-0000-0000-0000-000000000001', 'system', 'test'),
  ('10000000-0000-0000-0000-000000000002', 'system', 'test');
insert into public.feature_flags (key, company_id, enabled) values
  ('demo.flag', null, true),
  ('demo.flag', '10000000-0000-0000-0000-000000000002', false);
insert into storage.objects (bucket_id, name, owner_id) values
  ('selfies', '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/2026-11-04/a.webp', '20000000-0000-0000-0000-000000000001'),
  ('selfies', '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003/2026-11-04/b.webp', '20000000-0000-0000-0000-000000000003');

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'RLS is still enabled on every public table');

-- ---------------------------------------------------------------- employee of A (aisyah)
select pg_temp.act_as('20000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.leave_balances), 3, 'employee reads only own balances');
select is((select count(*)::int from public.leave_types), 3, 'employee reads own company leave types');
select is((select count(*)::int from public.leave_requests), 0, 'employee sees no leave requests of others');
select is((select count(*)::int from public.medical_claims), 1, 'employee reads only own claims');
select is((select count(*)::int from public.holidays), 2, 'employee reads own company holidays');
select is((select count(*)::int from public.claim_policies), 1, 'employee reads own company claim policy');
select is((select count(*)::int from public.audit_log), 0, 'employee reads no audit log');
select is((select count(*)::int from public.feature_flags), 1, 'employee reads global flags, not other companies');
select is((select bool_and(is_corrected) from public.attendance_effective), true, 'effective view shows the correction');
select is((select count(*)::int from public.attendance_effective), 1, 'effective view respects RLS');
select is((select count(*)::int from storage.objects where bucket_id = 'selfies'), 1, 'employee reads only own selfies');
select throws_ok(
  $$insert into public.leave_requests (company_id, user_id, leave_type_id, start_date, end_date, days, client_request_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
            '60000000-0000-0000-0000-000000000001', '2026-12-01', '2026-12-01', 1, gen_random_uuid())$$,
  '42501', null, 'employee cannot insert leave requests directly');
select throws_ok(
  $$update public.leave_balances set used = 0$$,
  '42501', null, 'employee cannot change leave balances');
select throws_ok(
  $$insert into public.medical_claims (company_id, user_id, clinic, visit_date, amount, client_request_id)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'x', '2026-11-01', 1, gen_random_uuid())$$,
  '42501', null, 'employee cannot insert claims directly');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('selfies',
    '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/2026-11-06/c.webp',
    '20000000-0000-0000-0000-000000000001')$$,
  'employee can upload a selfie to own folder');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('selfies',
    '10000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000003/2026-11-06/d.webp',
    '20000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'employee cannot upload into another company folder');

-- ---------------------------------------------------------------- HR of A (meiling)
select pg_temp.act_as('20000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.leave_balances), 5, 'HR reads all balances in own company');
select is((select count(*)::int from public.medical_claims), 1, 'HR reads own company claims only');
select is((select count(*)::int from public.audit_log), 1, 'HR reads own company audit log only');
select is((select count(*)::int from public.attendance_corrections), 1, 'HR reads own company corrections');
select is((select count(*)::int from storage.objects where bucket_id = 'selfies'), 2, 'HR reads own company selfies only');

-- ---------------------------------------------------------------- employee of B (kenneth)
select pg_temp.act_as('20000000-0000-0000-0000-000000000003');
select is((select count(*)::int from public.leave_requests), 1, 'employee of B reads own leave request');
select is((select count(*)::int from public.attendance_corrections), 0, 'employee of B sees no corrections of A');
select is((select count(*)::int from public.feature_flags), 2, 'employee of B reads global and own company flags');

-- ---------------------------------------------------------------- platform without grant (ops)
select pg_temp.act_as('20000000-0000-0000-0000-000000000004');
select is((select count(*)::int from public.leave_requests) + (select count(*)::int from public.medical_claims), 0,
  'platform reads no leave or claims without a grant');

select * from finish();
rollback;
