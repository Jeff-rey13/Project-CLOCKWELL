-- Attendance corrections (migration 0009).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- A closed late shift and an open (forgotten) shift for aisyah, yesterday.
update public.attendance set clock_out_at = clock_in_at + interval '1 minute' where clock_out_at is null;
insert into public.attendance (id, company_id, user_id, office_id, work_date, clock_in_at, clock_out_at, clock_in_place, status, client_request_id) values
  ('b1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', (now() - interval '2 days')::date, now() - interval '2 days',
   now() - interval '2 days' + interval '9 hours', 'site', 'late', gen_random_uuid()),
  ('b1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', (now() - interval '1 day')::date, now() - interval '1 day',
   null, 'site', 'on_time', gen_random_uuid());

-- Employee request, then HR approval.
select is((public.request_correction('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001', 'clock_in', now() - interval '2 days' - interval '20 minutes', 'device_delay', 'Phone froze')).status::text,
  'pending', 'employee can request a fix on own shift');
select throws_ok($$select public.request_correction('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001', 'clock_in', now() - interval '2 days' - interval '10 minutes', 'other', '')$$,
  'P0001', 'VALIDATION_FAILED', 'only one pending request per field');
select throws_ok($$select public.request_correction('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
  'b1000000-0000-0000-0000-000000000001', 'clock_in', now() - interval '2 days', 'other', '')$$,
  'P0001', 'FORBIDDEN', 'cannot request a fix on someone else''s shift');
select throws_ok($$select public.request_correction('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001', 'clock_out', now() - interval '2 days' - interval '1 hour', 'other', '')$$,
  'P0001', 'VALIDATION_FAILED', 'clock-out cannot be before clock-in');

select is((public.decide_correction('10000000-0000-0000-0000-000000000001',
  (select id from public.attendance_corrections where attendance_id = 'b1000000-0000-0000-0000-000000000001' and status = 'pending'),
  '20000000-0000-0000-0000-000000000002', true)).status::text, 'approved', 'HR approves the request');
select is((select is_corrected from public.attendance_effective where id = 'b1000000-0000-0000-0000-000000000001'),
  true, 'effective view shows the shift as corrected');
select ok((select clock_in_at from public.attendance where id = 'b1000000-0000-0000-0000-000000000001')
  > (select effective_clock_in_at from public.attendance_effective where id = 'b1000000-0000-0000-0000-000000000001'),
  'original server time is kept; effective time is the corrected one');

-- HR adjusts the forgotten clock-out directly; the shift is closed.
select is((public.adjust_attendance('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000002', 'clock_out', now() - interval '1 day' + interval '8 hours', 'forgot', 'Left at 6pm')).status::text,
  'approved', 'HR adjusts a forgotten clock-out');
select isnt((select clock_out_at from public.attendance where id = 'b1000000-0000-0000-0000-000000000002'), null,
  'the open shift is closed so the employee can clock in again');
select throws_ok($$select public.adjust_attendance('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000002', 'clock_in', now() - interval '1 day', 'other', '')$$,
  'P0001', 'FORBIDDEN', 'another company cannot adjust it');

set local role authenticated;
select throws_ok($$select public.adjust_attendance(null, null, null, 'clock_in', now(), 'other', '')$$, '42501', null,
  'browser roles cannot adjust attendance');
reset role;

select * from finish();
rollback;
