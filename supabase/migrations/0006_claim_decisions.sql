-- 0006: medical claim decisions (PRD 2.2, 7: decide-claim re-checks the limit).
-- Called only by Edge Functions with the service role, after they have checked the caller.

create or replace function public.decide_claim(
  p_company uuid, p_claim uuid, p_decider uuid, p_approve boolean, p_note text
) returns public.medical_claims
language plpgsql security definer set search_path = '' as $$
declare
  c public.medical_claims;
  pol public.claim_policies;
  approved numeric;
begin
  select * into c from public.medical_claims
   where id = p_claim and company_id = p_company for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if c.status <> 'pending' then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;

  if p_approve then
    -- Lock the policy row so two approvals in the same year are checked one after the other.
    select * into pol from public.claim_policies
     where company_id = p_company and year = extract(year from c.visit_date)::int
     for update;
    if not found then raise exception 'CLAIM_LIMIT' using errcode = 'P0001'; end if;
    if pol.per_claim_limit is not null and c.amount > pol.per_claim_limit then
      raise exception 'CLAIM_LIMIT' using errcode = 'P0001';
    end if;
    select coalesce(sum(amount), 0) into approved from public.medical_claims
     where user_id = c.user_id and status = 'approved'
       and extract(year from visit_date)::int = pol.year;
    if approved + c.amount > pol.annual_limit then
      raise exception 'CLAIM_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  update public.medical_claims
     set status = case when p_approve then 'approved' else 'rejected' end::public.decision_status,
         decided_by = p_decider, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_claim
  returning * into c;

  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id, meta)
  values (p_company, p_decider, 'hr', case when p_approve then 'claim.approved' else 'claim.rejected' end,
          'medical_claims', p_claim::text, jsonb_build_object('amount', c.amount));
  return c;
end $$;

revoke all on function public.decide_claim(uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.decide_claim(uuid, uuid, uuid, boolean, text) to service_role;
