import { cronAllowed } from './jobs.ts';
import { AppError, handle } from './http.ts';
import { admin } from './clients.ts';

/** Companies a job should work on: not suspended and not being deleted. */
export async function liveCompanies(): Promise<Array<{ id: string; timezone: string; modules: Record<string, boolean> }>> {
  const db = admin();
  const r = await db
    .from('companies')
    .select('id, status, company_settings(timezone, modules)')
    .in('status', ['onboarding', 'trial', 'active']);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).map((c) => {
    const s = (Array.isArray(c.company_settings) ? c.company_settings[0] : c.company_settings) as
      | { timezone?: string; modules?: Record<string, boolean> }
      | null;
    return { id: c.id as string, timezone: s?.timezone ?? 'Asia/Singapore', modules: s?.modules ?? {} };
  });
}

/** A scheduled job: only callable with the job secret; returns counts, never personal data. */
export function job(name: string, run: () => Promise<Record<string, number>>): void {
  handle(name, async ({ req }) => {
    if (!cronAllowed(req)) throw new AppError('FORBIDDEN', 'job secret');
    return await run();
  });
}
