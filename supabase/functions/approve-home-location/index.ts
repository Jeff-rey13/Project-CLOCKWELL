// HR approves or rejects an employee's registered home location.
import { homeLocationDecisionSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('approve-home-location', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = homeLocationDecisionSchema.parse(body);
  if (input.user_id === caller.userId) throw new AppError('FORBIDDEN', 'own');
  const db = admin();

  const result = await db
    .from('employee_rules')
    .update(
      input.approve
        ? { home_status: 'approved', home_approved_by: caller.userId, home_approved_at: new Date().toISOString() }
        : { home_status: 'none', home_lat: null, home_lng: null, home_approved_by: null, home_approved_at: null },
    )
    .eq('company_id', caller.companyId)
    .eq('user_id', input.user_id)
    .eq('home_status', 'pending')
    .select('home_status')
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new AppError('VALIDATION_FAILED', 'not pending');

  await audit(
    caller.companyId,
    caller.userId,
    'hr',
    input.approve ? 'home_location.approved' : 'home_location.rejected',
    'employee_rules',
    input.user_id,
  );
  return { home_status: result.data.home_status };
});
