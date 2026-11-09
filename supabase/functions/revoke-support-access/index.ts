// HR ends a support access grant straight away.
import { supportRevokeSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('revoke-support-access', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = supportRevokeSchema.parse(body);
  const result = await admin()
    .from('support_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('company_id', caller.companyId)
    .eq('id', input.grant_id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new AppError('VALIDATION_FAILED', 'not active');
  await audit(caller.companyId, caller.userId, 'hr', 'support.revoked', 'support_grants', input.grant_id);
  return { id: input.grant_id };
});
