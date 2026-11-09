-- Sign-in support (migrations 0003, 0010): rate limit on failed attempts, privacy acknowledgement.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Five failed attempts per user key in 15 minutes are allowed; then the user key is blocked.
select is(public.login_allowed('t:a', '1.1.1.1'), true, 'first attempt allowed');
select public.login_failed('t:a', '1.1.1.1') from generate_series(1, 4);
select is(public.login_allowed('t:a', '1.1.1.1'), true, 'after 4 failures still allowed');
select public.login_failed('t:a', '1.1.1.1');
select is(public.login_allowed('t:a', '1.1.1.9'), false, 'after 5 failures the username is blocked, from any IP');
select public.login_succeeded('t:a');
select is(public.login_allowed('t:a', '1.1.1.2'), true, 'success clears the user counter');

-- Twenty failures from one IP block that IP; successes never count.
select public.login_failed('ip:' || g, '9.9.9.9') from generate_series(1, 20) g;
select is(public.login_allowed('someone:new', '9.9.9.9'), false, 'twenty failures block the IP');
select is(public.login_allowed('someone:new', '9.9.9.8'), true, 'other IPs are not affected');

-- Browser roles cannot call the login helpers.
set local role authenticated;
select throws_ok($$select public.login_failed('x', 'y')$$, '42501', null, 'authenticated cannot call login_failed');
reset role;

-- Privacy acknowledgement is stored for the caller only.
update public.profiles set privacy_ack_at = null where user_id = '20000000-0000-0000-0000-000000000001';
select set_config('t.unacked', (select count(*) from public.profiles where privacy_ack_at is null)::text, true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select isnt(public.acknowledge_privacy(), null, 'employee acknowledges the privacy notice');
reset role;
select is(
  (select count(*)::int from public.profiles where privacy_ack_at is null),
  current_setting('t.unacked')::int - 1, 'acknowledgement saved; no other profile touched');

select * from finish();
rollback;
