// Employee leave request: working days, overlap and balance checks (PRD 2.1, 4.4).
import { leaveRequestSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';
import { attachmentPathAllowed, checkLeaveRequest, type ExistingRequest } from '../_shared/leave.ts';

const RESULT = 'id, leave_type_id, start_date, end_date, half_day_end, days, status, created_at';

handle('request-leave', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = leaveRequestSchema.parse(body);
  const db = admin();

  const prior = await db
    .from('leave_requests')
    .select(RESULT)
    .eq('user_id', caller.userId)
    .eq('client_request_id', input.client_request_id)
    .maybeSingle();
  if (prior.data) return prior.data;

  const year = Number(input.start_date.slice(0, 4));
  const [settings, profile, type, holidays, existing, balance] = await Promise.all([
    db.from('company_settings').select('modules').eq('company_id', caller.companyId).single(),
    db.from('profiles').select('status').eq('company_id', caller.companyId).eq('user_id', caller.userId).single(),
    db
      .from('leave_types')
      .select('id, requires_attachment')
      .eq('company_id', caller.companyId)
      .eq('id', input.leave_type_id)
      .maybeSingle(),
    db
      .from('holidays')
      .select('date')
      .eq('company_id', caller.companyId)
      .gte('date', input.start_date)
      .lte('date', input.end_date),
    db
      .from('leave_requests')
      .select('start_date, end_date, status, leave_type_id, days')
      .eq('company_id', caller.companyId)
      .eq('user_id', caller.userId)
      .in('status', ['pending', 'approved']),
    db
      .from('leave_balances')
      .select('entitled, used')
      .eq('company_id', caller.companyId)
      .eq('user_id', caller.userId)
      .eq('leave_type_id', input.leave_type_id)
      .eq('year', year)
      .maybeSingle(),
  ]);
  if (settings.error || profile.error || holidays.error || existing.error) throw new Error('load failed');

  const modules = (settings.data.modules ?? {}) as Record<string, unknown>;
  if (modules.leave === false) throw new AppError('FEATURE_OFF');
  if (profile.data.status !== 'active') throw new AppError('NOT_ACTIVE');
  if (!type.data) throw new AppError('VALIDATION_FAILED', 'leave type');

  if (!attachmentPathAllowed(input.attachment_path, caller.companyId, caller.userId)) {
    throw new AppError('FORBIDDEN', 'attachment path');
  }
  if (input.attachment_path) {
    const slash = input.attachment_path.lastIndexOf('/');
    const { data: found } = await db.storage
      .from('receipts')
      .list(input.attachment_path.slice(0, slash), { search: input.attachment_path.slice(slash + 1), limit: 1 });
    if (!(found ?? []).some((o) => o.name === input.attachment_path!.slice(slash + 1))) {
      throw new AppError('VALIDATION_FAILED', 'attachment missing');
    }
  }

  const check = checkLeaveRequest({
    startDate: input.start_date,
    endDate: input.end_date,
    halfDayEnd: input.half_day_end,
    leaveTypeId: input.leave_type_id,
    holidays: (holidays.data ?? []).map((h) => h.date as string),
    existing: (existing.data ?? []) as ExistingRequest[],
    balance: balance.data ?? null,
    requiresAttachment: type.data.requires_attachment as boolean,
    hasAttachment: !!input.attachment_path,
  });
  if (!check.ok) throw new AppError(check.code);

  const inserted = await db
    .from('leave_requests')
    .insert({
      company_id: caller.companyId,
      user_id: caller.userId,
      leave_type_id: input.leave_type_id,
      start_date: input.start_date,
      end_date: input.end_date,
      half_day_end: input.half_day_end,
      days: check.days,
      reason: input.reason || null,
      attachment_path: input.attachment_path,
      client_request_id: input.client_request_id,
    })
    .select(RESULT)
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const again = await db
        .from('leave_requests')
        .select(RESULT)
        .eq('user_id', caller.userId)
        .eq('client_request_id', input.client_request_id)
        .single();
      if (again.data) return again.data;
    }
    throw new Error(inserted.error.message);
  }

  await db.from('audit_log').insert({
    company_id: caller.companyId,
    actor_id: caller.userId,
    actor_type: caller.appRole,
    action: 'leave.requested',
    target_table: 'leave_requests',
    target_id: inserted.data.id,
    meta: { days: check.days },
  });

  return { ...inserted.data, balance_after: check.balanceAfter };
});
