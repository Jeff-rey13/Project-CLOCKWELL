// Clock out (PRD 7.1): closes the open shift with server time.
import { clockEventSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { gate, mergeFlags, planClock, selfiePathAllowed } from '../_shared/clock.ts';
import { loadClockContext, selfieExists } from '../_shared/clock-context.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';
import type { AttendanceFlag } from '../_shared/app.ts';

const RESULT_COLUMNS =
  'id, work_date, clock_in_at, clock_out_at, clock_out_place, clock_out_site_id, clock_out_distance_m, status, flags';

handle('clock-out', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = clockEventSchema.parse(body);
  const db = admin();

  const prior = await db
    .from('attendance')
    .select(RESULT_COLUMNS)
    .eq('user_id', caller.userId)
    .eq('clock_out_request_id', input.client_request_id)
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
    .select('id, flags')
    .eq('company_id', caller.companyId)
    .eq('user_id', caller.userId)
    .is('clock_out_at', null)
    .maybeSingle();
  if (!open.data) throw new AppError('NOT_CLOCKED_IN');

  const now = new Date();
  const plan = planClock({ ...ctx, office: ctx.office }, {
    now,
    deviceTime: new Date(input.device_time),
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracy_m,
    placeChoice: input.place_choice,
  });
  // Clock-out keeps the shift's on-time status; only location and timing flags are added.
  const flags = mergeFlags(open.data.flags as AttendanceFlag[], plan.flags.filter((f) => f !== 'not_home_day'));

  const updated = await db
    .from('attendance')
    .update({
      clock_out_at: now.toISOString(),
      clock_out_device_at: input.device_time,
      clock_out_lat: input.lat,
      clock_out_lng: input.lng,
      clock_out_accuracy_m: Math.round(input.accuracy_m * 10) / 10,
      clock_out_place: plan.place,
      clock_out_site_id: plan.place === 'site' ? plan.zoneId : null,
      clock_out_distance_m: plan.distanceM,
      clock_out_selfie_path: input.selfie_path,
      clock_out_request_id: input.client_request_id,
      flags,
    })
    .eq('id', open.data.id)
    .is('clock_out_at', null)
    .select(RESULT_COLUMNS)
    .maybeSingle();
  if (updated.error) throw new Error(updated.error.message);
  if (!updated.data) throw new AppError('NOT_CLOCKED_IN');

  await db.from('audit_log').insert({
    company_id: caller.companyId,
    actor_id: caller.userId,
    actor_type: caller.appRole,
    action: 'attendance.clock_out',
    target_table: 'attendance',
    target_id: open.data.id,
    meta: { flags, place: plan.place },
  });

  return updated.data;
});
