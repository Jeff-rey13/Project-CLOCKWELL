-- 0005: leave decisions in one transaction (PRD 7: decide-leave, private.apply_leave).
-- Called only by Edge Functions with the service role, after they have checked the caller.

-- Deducts an approved request from its balance. Locks the balance row so two approvals
-- cannot both pass the check. Raises LEAVE_BALANCE_LOW when the balance is too small.
create or replace function private.apply_leave(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
  b public.leave_balances;
begin
  select * into r from public.leave_requests where id = p_request for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;

  select * into b from public.leave_balances
   where user_id = r.user_id and leave_type_id = r.leave_type_id
     and year = extract(year from r.start_date)::int
   for update;
  if not found or b.used + r.days > b.entitled then
    raise exception 'LEAVE_BALANCE_LOW' using errcode = 'P0001';
  end if;

  update public.leave_balances set used = used + r.days
   where user_id = b.user_id and leave_type_id = b.leave_type_id and year = b.year;
end $$;

-- HR decision. Returns the updated request. Only pending requests of the same company can be decided.
create or replace function public.decide_leave(
  p_company uuid, p_request uuid, p_decider uuid, p_approve boolean, p_note text
) returns public.leave_requests
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
begin
  select * into r from public.leave_requests
   where id = p_request and company_id = p_company for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if r.status <> 'pending' then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;

  if p_approve then
    perform private.apply_leave(p_request);
  end if;

  update public.leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.leave_status,
         decided_by = p_decider, decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_request
  returning * into r;

  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id, meta)
  values (p_company, p_decider, 'hr', case when p_approve then 'leave.approved' else 'leave.rejected' end,
          'leave_requests', p_request::text, jsonb_build_object('days', r.days));
  return r;
end $$;

-- Cancel by the requester: a pending request, or an approved one that has not started (balance returned).
create or replace function public.cancel_leave(p_company uuid, p_request uuid, p_user uuid, p_today date)
returns public.leave_requests
language plpgsql security definer set search_path = '' as $$
declare
  r public.leave_requests;
begin
  select * into r from public.leave_requests
   where id = p_request and company_id = p_company and user_id = p_user for update;
  if not found then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if r.status = 'cancelled' then return r; end if;
  if r.status = 'rejected' or (r.status = 'approved' and r.start_date <= p_today) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;

  if r.status = 'approved' then
    update public.leave_balances set used = greatest(used - r.days, 0)
     where user_id = r.user_id and leave_type_id = r.leave_type_id
       and year = extract(year from r.start_date)::int;
  end if;

  update public.leave_requests set status = 'cancelled' where id = p_request returning * into r;

  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id)
  values (p_company, p_user, 'employee', 'leave.cancelled', 'leave_requests', p_request::text);
  return r;
end $$;

revoke all on function private.apply_leave(uuid) from public, anon, authenticated;
revoke all on function public.decide_leave(uuid, uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.cancel_leave(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.decide_leave(uuid, uuid, uuid, boolean, text) to service_role;
grant execute on function public.cancel_leave(uuid, uuid, uuid, date) to service_role;
