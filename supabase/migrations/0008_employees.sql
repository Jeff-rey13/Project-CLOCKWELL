-- 0008: employee lifecycle (PRD 2.4). Invited staff become active when they first acknowledge the
-- privacy notice; offboarding revokes every session at once.

create or replace function public.acknowledge_privacy() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  ts timestamptz;
begin
  update public.profiles
     set privacy_ack_at = coalesce(privacy_ack_at, now()),
         status = case when status = 'invited' then 'active'::public.profile_status else status end
   where user_id = auth.uid() and status <> 'offboarded'
  returning privacy_ack_at into ts;
  if ts is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id)
  select company_id, auth.uid(), app_role::text::public.actor_type, 'privacy.acknowledged', 'profiles', auth.uid()::text
  from public.profiles where user_id = auth.uid();
  return ts;
end $$;

-- Offboard: mark the profile and end every session and refresh token of the user.
create or replace function public.offboard_user(p_company uuid, p_user uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set status = 'offboarded', offboarded_at = now()
   where company_id = p_company and user_id = p_user and status <> 'offboarded';
  if not found then raise exception 'VALIDATION_FAILED' using errcode = 'P0001'; end if;
  delete from auth.refresh_tokens where user_id = p_user::text;
  delete from auth.sessions where user_id = p_user;
  insert into public.audit_log (company_id, actor_id, actor_type, action, target_table, target_id)
  values (p_company, p_actor, 'hr', 'employee.offboarded', 'profiles', p_user::text);
end $$;

revoke all on function public.offboard_user(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.offboard_user(uuid, uuid, uuid) to service_role;
