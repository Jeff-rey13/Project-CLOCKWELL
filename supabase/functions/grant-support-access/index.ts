// HR lets the vendor's support team see company data for up to 7 days, with a reason.
// Every support read is logged (support-view, task 3.2).
import { supportGrantSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { handle } from '../_shared/http.ts';

handle('grant-support-access', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = supportGrantSchema.parse(body);
  const db = admin();

  // Only one active grant at a time: end any current one first.
  await db
    .from('support_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('company_id', caller.companyId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  const expires = new Date(Date.now() + input.days * 24 * 3600 * 1000 - 60_000);
  const result = await db
    .from('support_grants')
    .insert({
      company_id: caller.companyId,
      granted_by: caller.userId,
      reason: input.reason,
      ticket_ref: input.ticket_ref || null,
      expires_at: expires.toISOString(),
    })
    .select('id, expires_at')
    .single();
  if (result.error) throw new Error(result.error.message);

  await audit(caller.companyId, caller.userId, 'hr', 'support.granted', 'support_grants', result.data.id, {
    days: input.days,
  });
  return result.data;
});
