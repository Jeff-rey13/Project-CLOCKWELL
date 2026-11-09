-- Local and staging seed only. Never run against production.
-- Seed passwords (Passw0rd!local) must never be used outside the local stack.

-- Fixed ids so tests and end-to-end flows can refer to them.
-- companies
--   harbourline 10000000-0000-0000-0000-000000000001
--   meridian    10000000-0000-0000-0000-000000000002
-- users
--   aisyah  20000000-0000-0000-0000-000000000001 (employee, harbourline)
--   meiling 20000000-0000-0000-0000-000000000002 (hr, harbourline)
--   kenneth 20000000-0000-0000-0000-000000000003 (employee, meridian)
--   ops     20000000-0000-0000-0000-000000000004 (platform owner)

insert into public.companies (id, name, slug, plan, seat_limit, release_track, status, hosting) values
  ('10000000-0000-0000-0000-000000000001', 'Harbourline Logistics', 'harbourline', 'business', 60, 'pilot', 'active', 'shared'),
  ('10000000-0000-0000-0000-000000000002', 'Meridian Clinics', 'meridian', 'starter', 25, 'stable', 'active', 'shared');

insert into public.company_settings (company_id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');

insert into public.offices (id, company_id, name, work_mode, home_days) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'HQ', 'onsite', '{}'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Tuas', 'hybrid', '{3,5}'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Novena', 'onsite', '{}');

insert into public.sites (id, company_id, office_id, name, lat, lng, radius_m) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'HQ, Marina View', 1.279400, 103.850500, 150),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'Tuas depot', 1.320300, 103.636000, 300),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Novena clinic', 1.320500, 103.843700, 120);

-- Auth users (local only). Token columns must be empty strings, not null, for the auth server.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('Passw0rd!local', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('20000000-0000-0000-0000-000000000001'::uuid, 'aisyah@harbourline.test'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'meiling@harbourline.test'),
  ('20000000-0000-0000-0000-000000000003'::uuid, 'kenneth@meridian.test'),
  ('20000000-0000-0000-0000-000000000004'::uuid, 'ops@vendor.test'),
  ('20000000-0000-0000-0000-000000000005'::uuid, 'ops2@vendor.test')
) as u(id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id::text like '20000000-0000-0000-0000-%';

insert into public.profiles (user_id, company_id, employee_code, full_name, username, work_email, app_role, department, office_id, start_date, status, privacy_ack_at) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'HL-0142', 'Aisyah Rahman', 'aisyah', 'aisyah@harbourline.test', 'employee', 'Operations', '30000000-0000-0000-0000-000000000001', '2024-03-04', 'active', now()),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'HL-0007', 'Mei Ling Tan', 'meiling', 'meiling@harbourline.test', 'hr', 'People', '30000000-0000-0000-0000-000000000001', '2021-08-16', 'active', now()),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'MC-0031', 'Kenneth Lim', 'kenneth', 'kenneth@meridian.test', 'employee', 'Front desk', '30000000-0000-0000-0000-000000000003', '2025-01-06', 'active', now());

insert into public.employee_rules (user_id, company_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002');

insert into public.platform_admins (user_id, role) values
  ('20000000-0000-0000-0000-000000000004', 'owner'),
  ('20000000-0000-0000-0000-000000000005', 'engineer');

-- One closed shift each for an employee of each company.
insert into public.attendance (
  company_id, user_id, office_id, work_date, clock_in_at, clock_in_device_at,
  clock_in_lat, clock_in_lng, clock_in_accuracy_m, clock_in_place, clock_in_site_id, clock_in_distance_m,
  clock_out_at, clock_out_place, status, flags, client_request_id
) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '2026-11-04', '2026-11-04 00:52:00+00', '2026-11-04 00:52:00+00', 1.279500, 103.850600, 12, 'site',
   '40000000-0000-0000-0000-000000000001', 15, '2026-11-04 10:06:00+00', 'site', 'on_time', '{}',
   '50000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003',
   '2026-11-04', '2026-11-04 01:12:00+00', '2026-11-04 01:12:00+00', 1.320600, 103.843800, 20, 'site',
   '40000000-0000-0000-0000-000000000003', 16, '2026-11-04 10:00:00+00', 'site', 'late', '{}',
   '50000000-0000-0000-0000-000000000002');

-- Leave, claims and platform settings (migration 0002)
insert into public.platform_settings (key, value) values
  ('min_app_version', '"0.1.0"'),
  ('current_version', '"0.1.0"');

insert into public.leave_types (id, company_id, code, name, days_per_year, requires_attachment, is_paid) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'annual', 'Annual leave', 14, false, true),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'sick', 'Sick leave', 14, true, true),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'unpaid', 'Unpaid leave', 30, false, false),
  ('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'annual', 'Annual leave', 12, false, true),
  ('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'sick', 'Sick leave', 14, true, true);

insert into public.leave_balances (company_id, user_id, leave_type_id, year, entitled, used) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 2026, 14, 2.5),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 2026, 14, 0),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 2026, 30, 0),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 2026, 18, 6),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 2026, 14, 1),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000004', 2026, 12, 3),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000005', 2026, 14, 0);

insert into public.holidays (company_id, date, name) values
  ('10000000-0000-0000-0000-000000000001', '2026-11-08', 'Deepavali'),
  ('10000000-0000-0000-0000-000000000001', '2026-12-25', 'Christmas Day'),
  ('10000000-0000-0000-0000-000000000002', '2026-11-08', 'Deepavali'),
  ('10000000-0000-0000-0000-000000000002', '2026-12-25', 'Christmas Day');

insert into public.claim_policies (company_id, year, annual_limit, per_claim_limit) values
  ('10000000-0000-0000-0000-000000000001', 2026, 500, 80),
  ('10000000-0000-0000-0000-000000000002', 2026, 400, null);

insert into public.medical_claims (company_id, user_id, clinic, visit_date, amount, status, client_request_id) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Raffles Medical Marina', '2026-10-21', 42.00, 'pending', '70000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', 'Novena Family Clinic', '2026-10-28', 35.00, 'approved', '70000000-0000-0000-0000-000000000002');

insert into public.leave_requests (company_id, user_id, leave_type_id, start_date, end_date, days, reason, status, client_request_id) values
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000004', '2026-12-01', '2026-12-02', 2, 'Family trip', 'pending', '80000000-0000-0000-0000-000000000001');
