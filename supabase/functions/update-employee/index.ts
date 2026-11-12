// HR edits an employee's details, office and role.
import { updateEmployeeSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('update-employee', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = updateEmployeeSchema.parse(body);
  const db = admin();

  const [target, office] = await Promise.all([
    db
      .from('profiles')
      .select('user_id, app_role, status')
      .eq('company_id', caller.companyId)
      .eq('user_id', input.user_id)
      .maybeSingle(),
    db.from('offices').select('id').eq('company_id', caller.companyId).eq('id', input.office_id).maybeSingle(),
  ]);
  if (!target.data) throw new AppError('FORBIDDEN', 'not found');
  if (!office.data) throw new AppError('VALIDATION_FAILED', 'office');
  if (target.data.status === 'offboarded') throw new AppError('NOT_ACTIVE');
  // HR cannot remove their own HR role, so a company is never left without HR by mistake.
  if (input.user_id === caller.userId && input.app_role !== 'hr') throw new AppError('FORBIDDEN', 'own role');

  const updated = await db
    .from('profiles')
    .update({
      full_name: input.full_name,
      department: input.department || null,
      office_id: input.office_id,
      start_date: input.start_date,
      app_role: input.app_role,
    })
    .eq('company_id', caller.companyId)
    .eq('user_id', input.user_id)
    .select('user_id, full_name, department, office_id, start_date, app_role')
    .single();
  if (updated.error) throw new Error(updated.error.message);

  await db.from('audit_log').insert({
    company_id: caller.companyId,
    actor_id: caller.userId,
    actor_type: 'hr',
    action: target.data.app_role !== input.app_role ? 'employee.role_changed' : 'employee.updated',
    target_table: 'profiles',
    target_id: input.user_id,
    meta: { role: input.app_role },
  });
  return updated.data;
});
