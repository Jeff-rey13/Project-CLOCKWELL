-- Claim decisions (migration 0006): limits re-checked on approval.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Harbourline 2026: annual 500, per claim 80 (seed). aisyah has one pending SGD 42 claim (seed).
delete from public.medical_claims where user_id = '20000000-0000-0000-0000-000000000001' and status = 'approved';
insert into public.medical_claims (id, company_id, user_id, clinic, visit_date, amount, client_request_id) values
  ('a1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A', '2026-10-01', 79, gen_random_uuid()),
  ('a1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'B', '2026-10-02', 95, gen_random_uuid());

select is((public.decide_claim('10000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002', true, '')).status::text, 'approved', 'claim within limits is approved');
select throws_ok($$select public.decide_claim('10000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002', true, '')$$, 'P0001', 'CLAIM_LIMIT', 'claim over the per-claim limit is refused');
select is((public.decide_claim('10000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002', false, 'Over the per-claim limit')).decision_note,
  'Over the per-claim limit', 'rejection stores the note');
select throws_ok($$select public.decide_claim('10000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002', false, '')$$, 'P0001', 'VALIDATION_FAILED', 'a decided claim cannot be decided again');

-- Yearly limit: fill up to 480 approved, then a 30 claim must fail.
insert into public.medical_claims (company_id, user_id, clinic, visit_date, amount, status, client_request_id)
select '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Z', '2026-09-01', 80, 'approved', gen_random_uuid()
from generate_series(1, 5);
insert into public.medical_claims (id, company_id, user_id, clinic, visit_date, amount, client_request_id) values
  ('a1000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'C', '2026-10-03', 30, gen_random_uuid());
select throws_ok($$select public.decide_claim('10000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002', true, '')$$, 'P0001', 'CLAIM_LIMIT', 'claim over the yearly limit is refused');

select throws_ok($$select public.decide_claim('10000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000002', false, '')$$, 'P0001', 'FORBIDDEN', 'another company cannot decide it');

set local role authenticated;
select throws_ok($$select public.decide_claim(null, null, null, true, '')$$, '42501', null, 'browser roles cannot call decide_claim');
reset role;

select * from finish();
rollback;
