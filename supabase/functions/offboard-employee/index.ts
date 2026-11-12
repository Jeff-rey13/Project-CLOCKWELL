// HR offboards an employee: profile offboarded, sessions revoked, sign-in banned (PRD 3.2).
import { offboardEmployeeSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';
import { rpcError } from '../_shared/rpc-error.ts';

handle('offboard-employee', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = offboardEmployeeSchema.parse(body);
  if (input.user_id === caller.userId) throw new AppError('FORBIDDEN', 'self');
  const db = admin();

  const { error } = await db.rpc('offboard_user', {
    p_company: caller.companyId,
    p_user: input.user_id,
    p_actor: caller.userId,
  });
  if (error) throw rpcError(error);

  // Block any future sign-in (about 100 years).
  const ban = await db.auth.admin.updateUserById(input.user_id, { ban_duration: '876000h' });
  if (ban.error) throw new Error(ban.error.message);

  return { user_id: input.user_id, status: 'offboarded' };
});
