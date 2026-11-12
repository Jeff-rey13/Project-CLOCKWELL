// Operations actions for the vendor team (PRD 7): feature flags now; releases and rollback in 3.7.
// Owner or engineer only, two-step sign-in when required. Every change is logged.
import { z } from 'zod';
import { setFlagForTrackSchema, setFlagSchema } from '../_shared/app.ts';
import { audit } from '../_shared/audit.ts';
import { requirePlatform } from '../_shared/auth.ts';
import { admin } from '../_shared/clients.ts';
import { AppError, handle } from '../_shared/http.ts';

const opsSchema = z.discriminatedUnion('action', [setFlagSchema, setFlagForTrackSchema]);

async function setFlag(key: string, companyId: string | null, enabled: boolean | null, actor: string): Promise<void> {
  const db = admin();
  const del = db.from('feature_flags').delete().eq('key', key);
  const cleared = companyId === null ? await del.is('company_id', null) : await del.eq('company_id', companyId);
  if (cleared.error) throw new Error(cleared.error.message);
  if (enabled === null) return;
  const ins = await db.from('feature_flags').insert({ key, company_id: companyId, enabled, updated_by: actor });
  if (ins.error) throw new Error(ins.error.message);
}

handle('ops-action', async ({ req, body }) => {
  const caller = await requirePlatform(req, ['owner', 'engineer']);
  const input = opsSchema.parse(body);
  const db = admin();

  if (input.action === 'set_flag') {
    if (input.company_id === null && input.enabled === null) throw new AppError('VALIDATION_FAILED', 'global needs a value');
    if (input.company_id) {
      const c = await db.from('companies').select('id').eq('id', input.company_id).maybeSingle();
      if (!c.data) throw new AppError('FORBIDDEN', 'company');
    }
    await setFlag(input.key, input.company_id, input.enabled, caller.userId);
    await db.from('audit_log').insert({
      company_id: input.company_id,
      actor_id: caller.userId,
      actor_type: 'platform',
      action: 'flag.set',
      target_table: 'feature_flags',
      target_id: input.key,
      meta: { enabled: input.enabled, scope: input.company_id ? 'company' : 'global' },
    });
    return { key: input.key, company_id: input.company_id, enabled: input.enabled };
  }

  // Release-track rollout: the same value for every company on the track (e.g. pilot first).
  const companies = await db.from('companies').select('id').eq('release_track', input.track);
  if (companies.error) throw new Error(companies.error.message);
  for (const c of companies.data ?? []) {
    await setFlag(input.key, c.id as string, input.enabled, caller.userId);
    await audit(c.id as string, caller.userId, 'platform', 'flag.set', 'feature_flags', input.key, {
      enabled: input.enabled,
      scope: `track:${input.track}`,
    });
  }
  return { key: input.key, track: input.track, companies: (companies.data ?? []).length };
});
