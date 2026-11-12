// HR onboards an employee: seat check, auth user with invite email, profile, rules and balances (PRD 2.4).
import { inviteEmployeeSchema, nextEmployeeCode, suggestUsername } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

function redirectBase(req: Request): string | undefined {
  const site = Deno.env.get('SITE_URL');
  if (site) return site;
  const origin = req.headers.get('origin') ?? '';
  return /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : undefined;
}

handle('invite-employee', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = inviteEmployeeSchema.parse(body);
  const db = admin();

  const [company, staff, office, types] = await Promise.all([
    db.from('companies').select('slug, seat_limit, status').eq('id', caller.companyId).single(),
    db.from('profiles').select('username, employee_code, status').eq('company_id', caller.companyId),
    db.from('offices').select('id').eq('company_id', caller.companyId).eq('id', input.office_id).maybeSingle(),
    db.from('leave_types').select('id, code, days_per_year').eq('company_id', caller.companyId),
  ]);
  if (company.error || staff.error || types.error) throw new Error('load failed');
  if (!office.data) throw new AppError('VALIDATION_FAILED', 'office');
  if (company.data.status === 'suspended') throw new AppError('COMPANY_SUSPENDED');

  const people = staff.data ?? [];
  const seatsUsed = people.filter((p) => p.status !== 'offboarded').length;
  if (seatsUsed >= company.data.seat_limit) throw new AppError('SEAT_LIMIT');

  const username = suggestUsername(input.full_name, new Set(people.map((p) => p.username as string)));
  const employeeCode = nextEmployeeCode(
    people.map((p) => p.employee_code as string),
    (company.data.slug as string).slice(0, 2).toUpperCase(),
  );

  const base = redirectBase(req);
  const invited = await db.auth.admin.inviteUserByEmail(input.work_email, {
    redirectTo: base ? `${base}/welcome/?company=${company.data.slug}` : undefined,
  });
  if (invited.error || !invited.data.user) {
    // Most often the email already has an account.
    throw new AppError('VALIDATION_FAILED', 'invite failed');
  }
  const userId = invited.data.user.id;

  const profile = await db.from('profiles').insert({
    user_id: userId,
    company_id: caller.companyId,
    employee_code: employeeCode,
    full_name: input.full_name,
    username,
    work_email: input.work_email,
    app_role: input.app_role,
    department: input.department || null,
    office_id: input.office_id,
    start_date: input.start_date,
    status: 'invited',
  });
  if (profile.error) {
    await db.auth.admin.deleteUser(userId);
    throw new Error(profile.error.message);
  }

  const year = new Date().getFullYear();
  await db.from('employee_rules').insert({ user_id: userId, company_id: caller.companyId });
  const balances = (types.data ?? []).map((t) => ({
    company_id: caller.companyId,
    user_id: userId,
    leave_type_id: t.id,
    year,
    entitled: t.code === 'annual' ? input.annual_leave : Number(t.days_per_year),
    used: 0,
  }));
  if (balances.length) {
    const b = await db.from('leave_balances').insert(balances);
    if (b.error) throw new Error(b.error.message);
  }

  await db.from('audit_log').insert({
    company_id: caller.companyId,
    actor_id: caller.userId,
    actor_type: 'hr',
    action: 'employee.invited',
    target_table: 'profiles',
    target_id: userId,
    meta: { role: input.app_role },
  });

  return { user_id: userId, username, employee_code: employeeCode, seats_used: seatsUsed + 1 };
});
