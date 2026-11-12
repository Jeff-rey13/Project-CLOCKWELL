-- 0010: the login rate limit counts failed attempts only (PRD 3.2).
-- Counting successes blocked whole offices behind one IP after 20 sign-ins.

-- True when another attempt is allowed. Does not record anything.
create or replace function public.login_allowed(p_user_key text, p_ip text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  by_user int;
  by_ip int;
begin
  select count(*) into by_user from private.login_attempts
    where user_key = p_user_key and at > now() - interval '15 minutes';
  select count(*) into by_ip from private.login_attempts
    where ip = p_ip and at > now() - interval '15 minutes';
  return by_user < 5 and by_ip < 20;
end $$;

-- Records a failed attempt.
create or replace function public.login_failed(p_user_key text, p_ip text) returns void
language sql security definer set search_path = '' as $$
  delete from private.login_attempts where at < now() - interval '1 day';
  insert into private.login_attempts (user_key, ip) values (p_user_key, p_ip);
$$;

revoke all on function public.login_allowed(text, text) from public, anon, authenticated;
revoke all on function public.login_failed(text, text) from public, anon, authenticated;
grant execute on function public.login_allowed(text, text) to service_role;
grant execute on function public.login_failed(text, text) to service_role;

-- The old combined check-and-record function is no longer used.
drop function if exists public.login_attempt(text, text);
