// HR approves or rejects a medical claim. Approval re-checks the limits under a lock.
import { claimDecisionSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';
import { rpcError } from '../_shared/rpc-error.ts';

handle('decide-claim', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['hr']);
  const input = claimDecisionSchema.parse(body);
  const db = admin();

  const { data: claim } = await db
    .from('medical_claims')
    .select('user_id')
    .eq('company_id', caller.companyId)
    .eq('id', input.claim_id)
    .maybeSingle();
  if (!claim) throw new AppError('FORBIDDEN', 'not found');
  if (claim.user_id === caller.userId) throw new AppError('FORBIDDEN', 'own claim');

  const { data, error } = await db.rpc('decide_claim', {
    p_company: caller.companyId,
    p_claim: input.claim_id,
    p_decider: caller.userId,
    p_approve: input.approve,
    p_note: input.note,
  });
  if (error) throw rpcError(error);
  return { id: data.id, status: data.status, decided_at: data.decided_at };
});
