// HR creates or updates an office and its work rules (PRD 2.6).
import { officeSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('save-office', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = officeSchema.parse(body);
  const db = admin();
  const values = {
    name: input.name,
    work_mode: input.work_mode,
    timezone: input.timezone,
    shift_start: input.shift_start,
    shift_end: input.shift_end,
    grace_minutes: input.grace_minutes,
    home_days: input.home_days,
    require_selfie: input.require_selfie,
    flag_outside: input.flag_outside,
    clockout_reminder: input.clockout_reminder,
    count_overtime: input.count_overtime,
  };

  const result = input.id
    ? await db.from('offices').update(values).eq('company_id', caller.companyId).eq('id', input.id).select('id').maybeSingle()
    : await db.from('offices').insert({ ...values, company_id: caller.companyId }).select('id').single();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new AppError('FORBIDDEN', 'not found');

  await audit(caller.companyId, caller.userId, 'hr', input.id ? 'office.updated' : 'office.created', 'offices', result.data.id);
  return { id: result.data.id };
});
