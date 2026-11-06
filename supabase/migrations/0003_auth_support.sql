-- 0003: sign-in support. Login rate limits, privacy notice acknowledgement.

-- Login attempts (PRD 3.2: 5 per username per 15 minutes, 20 per IP). Private schema, not exposed.
create table private.login_attempts (
  id bigserial primary key,
  user_key text not null,
  ip text not null,
  at timestamptz not null default now()
);
create index on private.login_attempts (user_key, at desc);
create index on private.login_attempts (ip, at desc);

-- True when another attempt is allowed. Records the attempt.
create or replace function public.login_attempt(p_user_key text, p_ip text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  by_user int;
  by_ip int;
begin
  delete from private.login_attempts where at < now() - interval '1 day';
  select count(*) into by_user from private.login_attempts
    where user_key = p_user_key and at > now() - interval '15 minutes';
  select count(*) into by_ip from private.login_attempts
    where ip = p_ip and at > now() - interval '15 minutes';
  if by_user >= 5 or by_ip >= 20 then
    return false;
  end if;
  insert into private.login_attempts (user_key, ip) values (p_user_key, p_ip);
  return true;
end $$;

-- Clears the per-user counter after a successful sign-in.
create or replace function public.login_succeeded(p_user_key text) returns void
language sql security definer set search_path = '' as $$
  delete from private.login_attempts where user_key = p_user_key
$$;

revoke all on function public.login_attempt(text, text) from public, anon, authenticated;
revoke all on function public.login_succeeded(text) from public, anon, authenticated;
grant execute on function public.login_attempt(text, text) to service_role;
grant execute on function public.login_succeeded(text) to service_role;

-- Privacy notice acknowledgement (PDPA). The signed-in user acknowledges for themselves only.
create or replace function public.acknowledge_privacy() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  ts timestamptz;
begin
  update public.profiles
     set privacy_ack_at = coalesce(privacy_ack_at, now())
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

revoke all on function public.acknowledge_privacy() from public, anon;
grant execute on function public.acknowledge_privacy() to authenticated;
