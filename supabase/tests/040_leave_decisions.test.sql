-- Leave decisions (migration 0005): balance deducted once, under lock; cancel returns balance.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- aisyah: annual 14 entitled, 2.5 used (seed). Two requests of 5 and 8 days.
insert into public.leave_requests (id, company_id, user_id, leave_type_id, start_date, end_date, days, client_request_id) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '60000000-0000-0000-0000-000000000001', '2026-12-07', '2026-12-11', 5, gen_random_uuid()),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '60000000-0000-0000-0000-000000000001', '2026-12-14', '2026-12-23', 8, gen_random_uuid());

create function pg_temp.used() returns numeric language sql as $$
  select used from public.leave_balances where user_id = '20000000-0000-0000-0000-000000000001'
    and leave_type_id = '60000000-0000-0000-0000-000000000001' and year = 2026
$$;
select set_config('t.used0', pg_temp.used()::text, true);

select is((public.decide_leave('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002', true, 'ok')).status::text, 'approved', 'HR approves the first request');
select is(pg_temp.used(), current_setting('t.used0')::numeric + 5, 'balance deducted once by 5');

select throws_ok($$select public.decide_leave('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002', true, '')$$, 'P0001', 'VALIDATION_FAILED', 'a decided request cannot be decided again');
select is(pg_temp.used(), current_setting('t.used0')::numeric + 5, 'no double deduction');

select throws_ok($$select public.decide_leave('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002', true, '')$$, 'P0001', 'LEAVE_BALANCE_LOW', 'approval over the balance is refused');
select is((select status::text from public.leave_requests where id = '90000000-0000-0000-0000-000000000002'),
  'pending', 'refused approval leaves the request pending');

select throws_ok($$select public.decide_leave('10000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002', false, '')$$, 'P0001', 'FORBIDDEN', 'another company cannot decide it');

select is((public.cancel_leave('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '2026-11-06')).status::text, 'cancelled', 'employee cancels approved future leave');
select is(pg_temp.used(), current_setting('t.used0')::numeric, 'balance returned on cancel');

select throws_ok($$select public.cancel_leave('10000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003', '2026-11-06')$$, 'P0001', 'FORBIDDEN', 'another user cannot cancel it');

set local role authenticated;
select throws_ok($$select public.decide_leave(null, null, null, true, '')$$, '42501', null, 'browser roles cannot call decide_leave');
reset role;

select * from finish();
rollback;
