// Support view (PRD 4.5, 3.2): a platform user reads company data only while the company's HR has
// granted access. Every read is written to the company's audit log, which HR sees in Settings.
// Data is minimised: no emails, coordinates, selfies, receipts or employee documents.
import { supportViewSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requirePlatform } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('support-view', async ({ req, body }) => {
  const caller = await requirePlatform(req, ['owner', 'engineer', 'support']);
  const input = supportViewSchema.parse(body);
  const db = admin();

  const grant = await db
    .from('support_grants')
    .select('id, expires_at')
    .eq('company_id', input.company_id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!grant.data) throw new AppError('SUPPORT_GRANT_REQUIRED');

  const c = input.company_id;
  let rows: unknown[] = [];
  switch (input.view) {
    case 'employees': {
      const r = await db
        .from('profiles')
        .select('user_id, full_name, employee_code, department, app_role, status, start_date, office_id')
        .eq('company_id', c)
        .order('full_name');
      if (r.error) throw new Error(r.error.message);
      rows = r.data ?? [];
      break;
    }
    case 'attendance': {
      const day = input.date ?? new Date().toISOString().slice(0, 10);
      const r = await db
        .from('attendance_effective')
        .select('id, user_id, work_date, effective_clock_in_at, effective_clock_out_at, status, flags, clock_in_place, is_corrected')
        .eq('company_id', c)
        .eq('work_date', day)
        .order('effective_clock_in_at');
      if (r.error) throw new Error(r.error.message);
      rows = r.data ?? [];
      break;
    }
    case 'leave': {
      const r = await db
        .from('leave_requests')
        .select('id, user_id, start_date, end_date, days, status, created_at, leave_types(name)')
        .eq('company_id', c)
        .order('created_at', { ascending: false })
        .limit(100);
      if (r.error) throw new Error(r.error.message);
      rows = r.data ?? [];
      break;
    }
    case 'claims': {
      const r = await db
        .from('medical_claims')
        .select('id, user_id, clinic, visit_date, amount, currency, status, created_at')
        .eq('company_id', c)
        .order('created_at', { ascending: false })
        .limit(100);
      if (r.error) throw new Error(r.error.message);
      rows = r.data ?? [];
      break;
    }
    case 'offices': {
      const r = await db
        .from('offices')
        .select('id, name, work_mode, timezone, shift_start, shift_end, grace_minutes, home_days, sites(id, name, radius_m)')
        .eq('company_id', c)
        .order('name');
      if (r.error) throw new Error(r.error.message);
      rows = r.data ?? [];
      break;
    }
  }

  // Names for the user ids in the result (support needs them to help HR); nothing else.
  let names: Record<string, string> = {};
  if (input.view !== 'employees' && input.view !== 'offices') {
    const r = await db.from('profiles').select('user_id, full_name').eq('company_id', c);
    names = Object.fromEntries((r.data ?? []).map((p) => [p.user_id as string, p.full_name as string]));
  }

  await audit(c, caller.userId, 'platform', 'support.viewed', input.view, grant.data.id, {
    view: input.view,
    date: input.date ?? null,
  });

  return { view: input.view, expires_at: grant.data.expires_at, rows, names };
});
