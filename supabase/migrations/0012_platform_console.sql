-- 0012: platform console (PRD 3.1). Platform users see companies and counts, never personal data.

-- Every company with seat counts and settings. Platform only.
create or replace function public.platform_companies()
returns table (
  id uuid, name text, slug text, plan public.plan, seat_limit int, seats_used bigint,
  release_track public.release_track, status public.company_status, hosting public.hosting,
  deletion_scheduled_at timestamptz, deletion_requested_by uuid, deletion_approved_by uuid,
  modules jsonb, created_at timestamptz, support_until timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select c.id, c.name, c.slug, c.plan, c.seat_limit,
           (select count(*) from public.profiles p where p.company_id = c.id and p.status <> 'offboarded'),
           c.release_track, c.status, c.hosting,
           c.deletion_scheduled_at, c.deletion_requested_by, c.deletion_approved_by,
           s.modules, c.created_at,
           (select max(g.expires_at) from public.support_grants g
             where g.company_id = c.id and g.revoked_at is null and g.expires_at > now())
      from public.companies c
      left join public.company_settings s on s.company_id = c.id
     order by c.name;
end $$;

-- Usage counts for one company (no personal data). Platform only.
create or replace function public.platform_company_usage(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'employees', (select count(*) from public.profiles where company_id = p_company and status = 'active'),
    'invited', (select count(*) from public.profiles where company_id = p_company and status = 'invited'),
    'offices', (select count(*) from public.offices where company_id = p_company),
    'clock_ins_7d', (select count(*) from public.attendance where company_id = p_company and clock_in_at > now() - interval '7 days'),
    'leave_pending', (select count(*) from public.leave_requests where company_id = p_company and status = 'pending'),
    'claims_pending', (select count(*) from public.medical_claims where company_id = p_company and status = 'pending')
  );
end $$;

-- Role of the signed-in platform user (owner, engineer, support), or null.
create or replace function public.my_platform_role() returns text
language sql stable security definer set search_path = '' as $$
  select role::text from public.platform_admins where user_id = auth.uid()
$$;

revoke all on function public.platform_companies() from public, anon;
revoke all on function public.platform_company_usage(uuid) from public, anon;
revoke all on function public.my_platform_role() from public, anon;
grant execute on function public.platform_companies() to authenticated;
grant execute on function public.platform_company_usage(uuid) to authenticated;
grant execute on function public.my_platform_role() to authenticated;
