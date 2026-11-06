// HR approves or rejects leave. Approval deducts the balance under a row lock (private.apply_leave).
import { leaveDecisionSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';
import { rpcError } from '../_shared/rpc-error.ts';

handle('decide-leave', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = leaveDecisionSchema.parse(body);
  const db = admin();

  // HR cannot decide their own request.
  const { data: own } = await db
    .from('leave_requests')
    .select('user_id')
    .eq('company_id', caller.companyId)
    .eq('id', input.request_id)
    .maybeSingle();
  if (!own) throw new AppError('FORBIDDEN', 'not found');
  if (own.user_id === caller.userId) throw new AppError('FORBIDDEN', 'own request');

  const { data, error } = await db.rpc('decide_leave', {
    p_company: caller.companyId,
    p_request: input.request_id,
    p_decider: caller.userId,
    p_approve: input.approve,
    p_note: input.note,
  });
  if (error) throw rpcError(error);
  return { id: data.id, status: data.status, decided_at: data.decided_at };
});
