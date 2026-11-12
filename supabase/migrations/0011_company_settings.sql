-- 0011: company settings support (PRD 2.7): HR admin list with two-step status.

-- HR admins of the caller's company and whether each has a verified authenticator app.
create or replace function public.hr_admins()
returns table (user_id uuid, full_name text, username text, mfa_enabled boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_hr() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select p.user_id, p.full_name, p.username,
           exists (select 1 from auth.mfa_factors f
                    where f.user_id = p.user_id and f.factor_type = 'totp' and f.status = 'verified')
      from public.profiles p
     where p.company_id = private.company_id() and p.app_role = 'hr' and p.status <> 'offboarded'
     order by p.full_name;
end $$;

revoke all on function public.hr_admins() from public, anon;
grant execute on function public.hr_admins() to authenticated;
