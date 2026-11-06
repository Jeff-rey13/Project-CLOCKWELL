import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClockContext, OfficeRow, RulesRow, SiteRow } from './clock.ts';

/** Loads everything clock-in and clock-out need, filtered to the caller's company. */
export async function loadClockContext(db: SupabaseClient, companyId: string, userId: string): Promise<ClockContext> {
  const [company, settings, profile, rules] = await Promise.all([
    db.from('companies').select('status').eq('id', companyId).single(),
    db.from('company_settings').select('modules').eq('company_id', companyId).single(),
    db.from('profiles').select('status, office_id').eq('company_id', companyId).eq('user_id', userId).single(),
    db
      .from('employee_rules')
      .select('work_mode_override, shift_start, grace_minutes, home_days, home_lat, home_lng, home_radius_m, home_status')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (company.error || settings.error || profile.error) throw new Error('context load failed');

  let office: OfficeRow | null = null;
  let sites: SiteRow[] = [];
  if (profile.data.office_id) {
    const [o, s] = await Promise.all([
      db
        .from('offices')
        .select('id, work_mode, timezone, shift_start, grace_minutes, home_days, require_selfie, flag_outside')
        .eq('company_id', companyId)
        .eq('id', profile.data.office_id)
        .single(),
      db.from('sites').select('id, lat, lng, radius_m').eq('company_id', companyId).eq('office_id', profile.data.office_id),
    ]);
    if (o.error || s.error) throw new Error('office load failed');
    office = o.data as OfficeRow;
    sites = (s.data ?? []) as SiteRow[];
  }

  const modules = (settings.data.modules ?? {}) as Record<string, unknown>;
  return {
    companyStatus: company.data.status as string,
    attendanceModule: modules.attendance !== false,
    profileStatus: profile.data.status as string,
    office,
    rules: (rules.data as RulesRow | null) ?? null,
    sites,
  };
}

/** True when the selfie object exists in storage. */
export async function selfieExists(db: SupabaseClient, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const { data, error } = await db.storage
    .from('selfies')
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  return !error && (data ?? []).some((o) => o.name === path.slice(slash + 1));
}
