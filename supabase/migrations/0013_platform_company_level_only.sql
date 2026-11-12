-- 0013: the vendor team sees company-level facts only (owner decision, privacy).
-- No headcounts, usage or activity of a company's people reach the platform console.
-- The seat limit is still enforced inside each company by invite-employee.

drop function if exists public.platform_company_usage(uuid);
drop function if exists public.platform_companies();

create function public.platform_companies()
returns table (
  id uuid, name text, slug text, plan public.plan, seat_limit int,
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
           c.release_track, c.status, c.hosting,
           c.deletion_scheduled_at, c.deletion_requested_by, c.deletion_approved_by,
           s.modules, c.created_at,
           (select max(g.expires_at) from public.support_grants g
             where g.company_id = c.id and g.revoked_at is null and g.expires_at > now())
      from public.companies c
      left join public.company_settings s on s.company_id = c.id
     order by c.name;
end $$;

revoke all on function public.platform_companies() from public, anon;
grant execute on function public.platform_companies() to authenticated;
