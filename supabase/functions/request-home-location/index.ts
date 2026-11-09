// Employee registers where they work from home. HR must approve it before it counts.
// The location is read once, on this explicit action; nothing is tracked.
import { homeLocationRequestSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('request-home-location', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = homeLocationRequestSchema.parse(body);
  if (input.accuracy_m > 100) throw new AppError('GPS_WEAK');
  const db = admin();

  const result = await db
    .from('employee_rules')
    .upsert(
      {
        user_id: caller.userId,
        company_id: caller.companyId,
        home_lat: Math.round(input.lat * 1e6) / 1e6,
        home_lng: Math.round(input.lng * 1e6) / 1e6,
        home_status: 'pending',
        home_approved_by: null,
        home_approved_at: null,
      },
      { onConflict: 'user_id' },
    )
    .select('home_status')
    .single();
  if (result.error) throw new Error(result.error.message);

  await audit(caller.companyId, caller.userId, caller.appRole, 'home_location.requested', 'employee_rules', caller.userId);
  return { home_status: result.data.home_status };
});
