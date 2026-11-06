-- Sign-in support (migration 0003): rate limit and privacy acknowledgement.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Five attempts allowed per user key in 15 minutes, the sixth is refused.
select is(public.login_attempt('t:a', '1.1.1.1'), true, 'attempt 1 allowed');
select public.login_attempt('t:a', '1.1.1.1');
select public.login_attempt('t:a', '1.1.1.1');
select public.login_attempt('t:a', '1.1.1.1');
select is(public.login_attempt('t:a', '1.1.1.1'), true, 'attempt 5 allowed');
select is(public.login_attempt('t:a', '1.1.1.1'), false, 'attempt 6 refused');
select public.login_succeeded('t:a');
select is(public.login_attempt('t:a', '1.1.1.2'), true, 'success clears the user counter');

-- Browser roles cannot call the login helpers.
set local role authenticated;
select throws_ok($$select public.login_attempt('x', 'y')$$, '42501', null, 'authenticated cannot call login_attempt');
reset role;
set local role anon;
select throws_ok($$select public.login_succeeded('x')$$, '42501', null, 'anon cannot call login_succeeded');
reset role;

-- Privacy acknowledgement is stored for the caller only.
update public.profiles set privacy_ack_at = null where user_id = '20000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select isnt(public.acknowledge_privacy(), null, 'employee acknowledges the privacy notice');
reset role;
select is(
  (select count(*)::int from public.profiles where privacy_ack_at is null),
  0, 'acknowledgement saved; no other profile touched');

select * from finish();
rollback;
