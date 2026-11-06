// Clock in (PRD 7.1). Server time is the record; device time is kept only as extra information.
import { clockEventSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { gate, planClock, selfiePathAllowed } from '../_shared/clock.ts';
import { loadClockContext, selfieExists } from '../_shared/clock-context.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

const RESULT_COLUMNS =
  'id, work_date, clock_in_at, clock_in_place, clock_in_site_id, clock_in_distance_m, status, flags';

handle('clock-in', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = clockEventSchema.parse(body);
  const db = admin();

  // Same client_request_id: return the original result.
  const prior = await db
    .from('attendance')
    .select(RESULT_COLUMNS)
    .eq('user_id', caller.userId)
    .eq('client_request_id', input.client_request_id)
    .maybeSingle();
  if (prior.data) return prior.data;

  const ctx = await loadClockContext(db, caller.companyId, caller.userId);
  const blocked = gate(ctx, input.selfie_path);
  if (blocked) throw new AppError(blocked);
  if (!ctx.office) throw new AppError('FORBIDDEN');
  if (!selfiePathAllowed(input.selfie_path, caller.companyId, caller.userId)) {
    throw new AppError('FORBIDDEN', 'selfie path');
  }
  if (input.selfie_path && !(await selfieExists(db, input.selfie_path))) {
    throw new AppError('SELFIE_REQUIRED', 'selfie missing');
  }

  const open = await db
    .from('attendance')
    .select('id')
    .eq('user_id', caller.userId)
    .is('clock_out_at', null)
    .maybeSingle();
  if (open.data) throw new AppError('ALREADY_CLOCKED_IN');

  const now = new Date();
  const plan = planClock({ ...ctx, office: ctx.office }, {
    now,
    deviceTime: new Date(input.device_time),
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracy_m,
    placeChoice: input.place_choice,
  });

  const inserted = await db
    .from('attendance')
    .insert({
      company_id: caller.companyId,
      user_id: caller.userId,
      office_id: ctx.office.id,
      work_date: plan.workDate,
      clock_in_at: now.toISOString(),
      clock_in_device_at: input.device_time,
      clock_in_lat: input.lat,
      clock_in_lng: input.lng,
      clock_in_accuracy_m: Math.round(input.accuracy_m * 10) / 10,
      clock_in_place: plan.place,
      clock_in_site_id: plan.place === 'site' ? plan.zoneId : null,
      clock_in_distance_m: plan.distanceM,
      clock_in_selfie_path: input.selfie_path,
      status: plan.status,
      flags: plan.flags,
      client_request_id: input.client_request_id,
    })
    .select(RESULT_COLUMNS)
    .single();

  if (inserted.error) {
    // 23505: a concurrent request won the race (open shift or same request id).
    if (inserted.error.code === '23505') {
      const again = await db
        .from('attendance')
        .select(RESULT_COLUMNS)
        .eq('user_id', caller.userId)
        .eq('client_request_id', input.client_request_id)
        .maybeSingle();
      if (again.data) return again.data;
      throw new AppError('ALREADY_CLOCKED_IN');
    }
    throw new Error(inserted.error.message);
  }

  await db.from('audit_log').insert({
    company_id: caller.companyId,
    actor_id: caller.userId,
    actor_type: caller.appRole,
    action: 'attendance.clock_in',
    target_table: 'attendance',
    target_id: inserted.data.id,
    meta: { status: plan.status, flags: plan.flags, place: plan.place },
  });

  return inserted.data;
});
