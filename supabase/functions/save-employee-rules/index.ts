// HR sets one employee's overrides (work mode, shift, grace, home days, home location).
// A home location set by HR is approved straight away.
import { employeeRulesSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('save-employee-rules', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = employeeRulesSchema.parse(body);
  const db = admin();

  const person = await db
    .from('profiles')
    .select('user_id')
    .eq('company_id', caller.companyId)
    .eq('user_id', input.user_id)
    .maybeSingle();
  if (!person.data) throw new AppError('FORBIDDEN', 'not found');
  if ((input.home_lat === null) !== (input.home_lng === null)) throw new AppError('VALIDATION_FAILED', 'home');

  const hasHome = input.home_lat !== null && input.home_lng !== null;
  const result = await db
    .from('employee_rules')
    .upsert(
      {
        user_id: input.user_id,
        company_id: caller.companyId,
        work_mode_override: input.work_mode_override,
        shift_start: input.shift_start,
        shift_end: input.shift_end,
        grace_minutes: input.grace_minutes,
        home_days: input.home_days,
        home_lat: input.home_lat,
        home_lng: input.home_lng,
        home_radius_m: input.home_radius_m,
        home_status: hasHome ? 'approved' : 'none',
        home_approved_by: hasHome ? caller.userId : null,
        home_approved_at: hasHome ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id' },
    )
    .select('user_id')
    .single();
  if (result.error) throw new Error(result.error.message);

  await audit(caller.companyId, caller.userId, 'hr', 'employee_rules.saved', 'employee_rules', input.user_id);
  return { user_id: input.user_id };
});
