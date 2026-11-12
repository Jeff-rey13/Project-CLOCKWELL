// HR saves branding and data retention (PRD 2.7). Plan, seats and modules are set by the vendor.
import { companySettingsSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('save-company-settings', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = companySettingsSchema.parse(body);
  if (input.logo_path !== null && !new RegExp(`^${caller.companyId}/logo\\.(png|svg)$`).test(input.logo_path)) {
    throw new AppError('FORBIDDEN', 'logo path');
  }
  const db = admin();

  const [company, settings] = await Promise.all([
    db.from('companies').update({ name: input.name, logo_path: input.logo_path }).eq('id', caller.companyId),
    db
      .from('company_settings')
      .update({
        selfie_retention_days: input.selfie_retention_days,
        record_retention_days: input.record_retention_days,
      })
      .eq('company_id', caller.companyId),
  ]);
  if (company.error || settings.error) throw new Error('save failed');

  await audit(caller.companyId, caller.userId, 'hr', 'company_settings.saved', 'company_settings', caller.companyId, {
    selfie_retention_days: input.selfie_retention_days,
    record_retention_days: input.record_retention_days,
  });
  return { ok: true };
});
