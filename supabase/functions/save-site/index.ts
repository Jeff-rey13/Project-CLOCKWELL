// HR adds, edits or removes a site (a place with a radius) of an office.
import { siteSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

handle('save-site', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = siteSchema.parse(body);
  const db = admin();

  const office = await db.from('offices').select('id').eq('company_id', caller.companyId).eq('id', input.office_id).maybeSingle();
  if (!office.data) throw new AppError('FORBIDDEN', 'office');

  if (input.delete) {
    if (!input.id) throw new AppError('VALIDATION_FAILED', 'id');
    const del = await db.from('sites').delete().eq('company_id', caller.companyId).eq('id', input.id).select('id');
    if (del.error) throw new Error(del.error.message);
    if (!del.data?.length) throw new AppError('FORBIDDEN', 'not found');
    await audit(caller.companyId, caller.userId, 'hr', 'site.deleted', 'sites', input.id);
    return { id: input.id, deleted: true };
  }

  const values = {
    office_id: input.office_id,
    name: input.name,
    lat: Math.round(input.lat * 1e6) / 1e6,
    lng: Math.round(input.lng * 1e6) / 1e6,
    radius_m: input.radius_m,
  };
  const result = input.id
    ? await db.from('sites').update(values).eq('company_id', caller.companyId).eq('id', input.id).select('id').maybeSingle()
    : await db.from('sites').insert({ ...values, company_id: caller.companyId }).select('id').single();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new AppError('FORBIDDEN', 'not found');

  await audit(caller.companyId, caller.userId, 'hr', input.id ? 'site.updated' : 'site.created', 'sites', result.data.id);
  return { id: result.data.id };
});
