// HR decides a time-fix request, or adjusts a shift directly. Original times are never edited.
import { correctAttendanceSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { handle } from '../_shared/http.ts';
import { rpcError } from '../_shared/rpc-error.ts';

handle('correct-attendance', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = correctAttendanceSchema.parse(body);
  const db = admin();

  const { data, error } =
    'correction_id' in input
      ? await db.rpc('decide_correction', {
          p_company: caller.companyId,
          p_correction: input.correction_id,
          p_decider: caller.userId,
          p_approve: input.approve,
        })
      : await db.rpc('adjust_attendance', {
          p_company: caller.companyId,
          p_decider: caller.userId,
          p_attendance: input.attendance_id,
          p_field: input.field,
          p_at: input.corrected_at,
          p_reason: input.reason_code,
          p_note: input.note,
        });
  if (error) throw rpcError(error);
  return { id: data.id, status: data.status, corrected_at: data.corrected_at };
});
