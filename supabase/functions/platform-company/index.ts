// Platform console actions on a company (PRD 3.1): create (with first HR invite), plan and modules,
// suspend or activate, and deletion that needs a second platform admin to approve.
import { DELETION_GRACE_DAYS, platformCompanySchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requirePlatform } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

const DEFAULT_LEAVE = [
  { code: 'annual', name: 'Annual leave', days_per_year: 14, requires_attachment: false, is_paid: true },
  { code: 'sick', name: 'Sick leave', days_per_year: 14, requires_attachment: true, is_paid: true },
  { code: 'unpaid', name: 'Unpaid leave', days_per_year: 30, requires_attachment: false, is_paid: false },
];

function siteUrl(req: Request): string | undefined {
  const site = Deno.env.get('SITE_URL');
  if (site) return site;
  const origin = req.headers.get('origin') ?? '';
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : undefined;
}

handle('platform-company', async ({ req, body }) => {
  const caller = await requirePlatform(req, ['owner', 'engineer']);
  const input = platformCompanySchema.parse(body);
  const db = admin();

  if (input.action === 'create') {
    const exists = await db.from('companies').select('id').eq('slug', input.slug).maybeSingle();
    if (exists.data) throw new AppError('VALIDATION_FAILED', 'slug taken');

    const company = await db
      .from('companies')
      .insert({
        name: input.name,
        slug: input.slug,
        plan: input.plan,
        seat_limit: input.seat_limit,
        release_track: input.release_track,
        status: 'onboarding',
        hosting: 'shared',
      })
      .select('id')
      .single();
    if (company.error) throw new Error(company.error.message);
    const companyId = company.data.id as string;
    const year = new Date().getFullYear();

    const [settings, office, types, policy] = await Promise.all([
      db.from('company_settings').insert({ company_id: companyId }),
      db.from('offices').insert({ company_id: companyId, name: 'Main office' }).select('id').single(),
      db.from('leave_types').insert(DEFAULT_LEAVE.map((t) => ({ ...t, company_id: companyId }))).select('id, code, days_per_year'),
      db.from('claim_policies').insert({ company_id: companyId, year, annual_limit: 500, per_claim_limit: null }),
    ]);
    if (settings.error || office.error || types.error || policy.error) throw new Error('company setup failed');

    // First HR admin, invited by email.
    const base = siteUrl(req);
    const invited = await db.auth.admin.inviteUserByEmail(input.hr_email, {
      redirectTo: base ? `${base}/welcome/?company=${input.slug}` : undefined,
    });
    if (invited.error || !invited.data.user) throw new AppError('VALIDATION_FAILED', 'hr invite failed');
    const userId = invited.data.user.id;
    const username = (input.hr_full_name.split(/\s+/)[0] ?? 'hr').toLowerCase().replace(/[^a-z0-9]/g, '') || 'hr';
    const profile = await db.from('profiles').insert({
      user_id: userId,
      company_id: companyId,
      employee_code: `${input.slug.slice(0, 2).toUpperCase()}-0001`,
      full_name: input.hr_full_name,
      username: username.length >= 2 ? username : `${username}hr`,
      work_email: input.hr_email,
      app_role: 'hr',
      office_id: office.data.id,
      start_date: new Date().toISOString().slice(0, 10),
      status: 'invited',
    });
    if (profile.error) {
      await db.auth.admin.deleteUser(userId);
      throw new Error(profile.error.message);
    }
    await db.from('employee_rules').insert({ user_id: userId, company_id: companyId });
    await db.from('leave_balances').insert(
      (types.data ?? []).map((t) => ({
        company_id: companyId,
        user_id: userId,
        leave_type_id: t.id,
        year,
        entitled: Number(t.days_per_year),
        used: 0,
      })),
    );

    await audit(companyId, caller.userId, 'platform', 'company.created', 'companies', companyId, { plan: input.plan });
    return { id: companyId, slug: input.slug };
  }

  const current = await db
    .from('companies')
    .select('id, status, deletion_requested_by, deletion_approved_by')
    .eq('id', input.company_id)
    .maybeSingle();
  if (!current.data) throw new AppError('FORBIDDEN', 'not found');
  const c = current.data;

  switch (input.action) {
    case 'update': {
      const [co, st] = await Promise.all([
        db
          .from('companies')
          .update({ plan: input.plan, seat_limit: input.seat_limit, release_track: input.release_track })
          .eq('id', c.id),
        db.from('company_settings').update({ modules: input.modules }).eq('company_id', c.id),
      ]);
      if (co.error || st.error) throw new Error('update failed');
      await audit(c.id, caller.userId, 'platform', 'company.updated', 'companies', c.id, {
        plan: input.plan,
        seat_limit: input.seat_limit,
        release_track: input.release_track,
        modules: input.modules,
      });
      return { id: c.id };
    }
    case 'suspend':
    case 'activate': {
      if (c.status === 'pending_deletion') throw new AppError('VALIDATION_FAILED', 'pending deletion');
      const status = input.action === 'suspend' ? 'suspended' : 'active';
      const r = await db.from('companies').update({ status }).eq('id', c.id);
      if (r.error) throw new Error(r.error.message);
      await audit(c.id, caller.userId, 'platform', `company.${input.action === 'suspend' ? 'suspended' : 'activated'}`, 'companies', c.id);
      return { id: c.id, status };
    }
    case 'request_deletion': {
      if (c.status === 'pending_deletion') throw new AppError('VALIDATION_FAILED', 'already scheduled');
      const r = await db
        .from('companies')
        .update({ deletion_requested_by: caller.userId, deletion_approved_by: null, deletion_scheduled_at: null })
        .eq('id', c.id);
      if (r.error) throw new Error(r.error.message);
      await audit(c.id, caller.userId, 'platform', 'company.deletion_requested', 'companies', c.id);
      return { id: c.id, status: c.status };
    }
    case 'approve_deletion': {
      if (!c.deletion_requested_by) throw new AppError('VALIDATION_FAILED', 'no request');
      // A second platform admin must approve.
      if (c.deletion_requested_by === caller.userId) throw new AppError('FORBIDDEN', 'same admin');
      const at = new Date(Date.now() + DELETION_GRACE_DAYS * 24 * 3600 * 1000).toISOString();
      const r = await db
        .from('companies')
        .update({ status: 'pending_deletion', deletion_approved_by: caller.userId, deletion_scheduled_at: at })
        .eq('id', c.id);
      if (r.error) throw new Error(r.error.message);
      await audit(c.id, caller.userId, 'platform', 'company.deletion_approved', 'companies', c.id, { scheduled_at: at });
      return { id: c.id, status: 'pending_deletion', deletion_scheduled_at: at };
    }
    case 'cancel_deletion': {
      const r = await db
        .from('companies')
        .update({
          status: c.status === 'pending_deletion' ? 'suspended' : c.status,
          deletion_requested_by: null,
          deletion_approved_by: null,
          deletion_scheduled_at: null,
        })
        .eq('id', c.id);
      if (r.error) throw new Error(r.error.message);
      await audit(c.id, caller.userId, 'platform', 'company.deletion_cancelled', 'companies', c.id);
      return { id: c.id };
    }
  }
});
