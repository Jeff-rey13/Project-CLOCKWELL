import { admin } from './clients.ts';

/** Writes one audit row. Ids and codes only; never personal data. */
export async function audit(
  companyId: string,
  actorId: string,
  actorType: 'employee' | 'hr' | 'platform' | 'system',
  action: string,
  targetTable: string,
  targetId: string,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await admin().from('audit_log').insert({
    company_id: companyId,
    actor_id: actorId,
    actor_type: actorType,
    action,
    target_table: targetTable,
    target_id: targetId,
    meta,
  });
}
