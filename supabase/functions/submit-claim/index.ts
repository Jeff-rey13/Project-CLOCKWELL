// Employee medical claim: receipt check, per-claim and yearly limit (PRD 2.2).
import { claimFits, claimSubmitSchema } from '../_shared/app.ts';
import { requireCompanyRole } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';
import { objectExists, receiptPathAllowed } from '../_shared/storage.ts';

const RESULT = 'id, clinic, visit_date, amount, currency, status, created_at';

handle('submit-claim', async ({ req, body }) => {
  const caller = await requireCompanyRole(req, ['employee', 'hr']);
  const input = claimSubmitSchema.parse(body);
  const db = admin();

  const prior = await db
    .from('medical_claims')
    .select(RESULT)
    .eq('user_id', caller.userId)
    .eq('client_request_id', input.client_request_id)
    .maybeSingle();
  if (prior.data) return prior.data;

  const year = Number(input.visit_date.slice(0, 4));
  const [settings, profile, policy, claims] = await Promise.all([
    db.from('company_settings').select('modules, currency, timezone').eq('company_id', caller.companyId).single(),
    db.from('profiles').select('status').eq('company_id', caller.companyId).eq('user_id', caller.userId).single(),
    db
      .from('claim_policies')
      .select('annual_limit, per_claim_limit')
      .eq('company_id', caller.companyId)
      .eq('year', year)
      .maybeSingle(),
    db
      .from('medical_claims')
      .select('amount, status, visit_date')
      .eq('company_id', caller.companyId)
      .eq('user_id', caller.userId)
      .in('status', ['pending', 'approved'])
      .gte('visit_date', `${year}-01-01`)
      .lte('visit_date', `${year}-12-31`),
  ]);
  if (settings.error || profile.error || claims.error) throw new Error('load failed');

  const modules = (settings.data.modules ?? {}) as Record<string, unknown>;
  if (modules.claims === false) throw new AppError('FEATURE_OFF');
  if (profile.data.status !== 'active') throw new AppError('NOT_ACTIVE');

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: settings.data.timezone ?? 'Asia/Singapore' }).format(new Date());
  if (input.visit_date > today) throw new AppError('VALIDATION_FAILED', 'future visit');

  for (const path of input.receipt_paths) {
    if (!receiptPathAllowed(path, caller.companyId, caller.userId, input.client_request_id)) {
      throw new AppError('FORBIDDEN', 'receipt path');
    }
    if (!(await objectExists(db, 'receipts', path))) throw new AppError('VALIDATION_FAILED', 'receipt missing');
  }

  if (!policy.data) throw new AppError('CLAIM_LIMIT', 'no policy');
  const rows = claims.data ?? [];
  const sum = (status: string) =>
    rows.filter((r) => r.status === status).reduce((s, r) => s + Number(r.amount), 0);
  const fits = claimFits(
    {
      annualLimit: Number(policy.data.annual_limit),
      perClaimLimit: policy.data.per_claim_limit === null ? null : Number(policy.data.per_claim_limit),
      approvedThisYear: sum('approved'),
      pendingThisYear: sum('pending'),
    },
    input.amount,
  );
  if (!fits) throw new AppError('CLAIM_LIMIT');

  const inserted = await db
    .from('medical_claims')
    .insert({
      company_id: caller.companyId,
      user_id: caller.userId,
      clinic: input.clinic,
      visit_date: input.visit_date,
      amount: input.amount,
      currency: settings.data.currency ?? 'SGD',
      receipt_paths: input.receipt_paths,
      client_request_id: input.client_request_id,
    })
    .select(RESULT)
    .single();
  if (inserted.error) {
    if (inserted.error.code === '23505') {
      const again = await db
        .from('medical_claims')
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
    action: 'claim.submitted',
    target_table: 'medical_claims',
    target_id: inserted.data.id,
    meta: { amount: input.amount },
  });
  return inserted.data;
});
