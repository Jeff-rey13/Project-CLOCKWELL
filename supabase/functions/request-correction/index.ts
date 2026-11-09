// Employee asks HR to fix a clock-in or clock-out time on their own shift.
import { correctionRequestSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { handle } from '../_shared/http.ts';
import { rpcError } from '../_shared/rpc-error.ts';

handle('request-correction', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = correctionRequestSchema.parse(body);
  const { data, error } = await admin().rpc('request_correction', {
    p_company: caller.companyId,
    p_user: caller.userId,
    p_attendance: input.attendance_id,
    p_field: input.field,
    p_at: input.corrected_at,
    p_reason: input.reason_code,
    p_note: input.note,
  });
  if (error) throw rpcError(error);
  return { id: data.id, status: data.status };
});
