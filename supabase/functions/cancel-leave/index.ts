// Employee cancels own leave: pending, or approved and not started (balance is returned).
import { leaveCancelSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { handle } from '../_shared/http.ts';
import { rpcError } from '../_shared/rpc-error.ts';

handle('cancel-leave', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = leaveCancelSchema.parse(body);
  const db = admin();

  const { data: settings } = await db
    .from('company_settings')
    .select('timezone')
    .eq('company_id', caller.companyId)
    .single();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings?.timezone ?? 'Asia/Singapore' }).format(new Date());

  const { data, error } = await db.rpc('cancel_leave', {
    p_company: caller.companyId,
    p_request: input.request_id,
    p_user: caller.userId,
    p_today: today,
  });
  if (error) throw rpcError(error);
  return { id: data.id, status: data.status };
});
