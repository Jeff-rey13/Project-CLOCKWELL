// Hourly: once a company's new year has started (its time zone), create the year's leave balances
// for everyone who does not have them yet. Annual leave keeps last year's entitlement; no carry-over.
// Idempotent: existing balances are never touched.
import { localParts } from '../_shared/app.ts';
import { admin } from '../_shared/clients.ts';
import { newYearEntitlement } from '../_shared/jobs.ts';
import { job, liveCompanies } from '../_shared/job-runner.ts';

job('leave-year-rollover', async () => {
  const db = admin();
  const now = new Date();
  let created = 0;

  for (const company of await liveCompanies()) {
    if (company.modules.leave === false) continue;
    const year = Number(localParts(now, company.timezone).date.slice(0, 4));
    const [staff, types, current, previous] = await Promise.all([
      db.from('profiles').select('user_id').eq('company_id', company.id).in('status', ['active', 'invited']),
      db.from('leave_types').select('id, code, days_per_year').eq('company_id', company.id),
      db.from('leave_balances').select('user_id, leave_type_id').eq('company_id', company.id).eq('year', year),
      db.from('leave_balances').select('user_id, leave_type_id, entitled').eq('company_id', company.id).eq('year', year - 1),
    ]);
    if (staff.error || types.error || current.error || previous.error) throw new Error('load failed');

    const have = new Set((current.data ?? []).map((b) => `${b.user_id}:${b.leave_type_id}`));
    const prev = new Map((previous.data ?? []).map((b) => [`${b.user_id}:${b.leave_type_id}`, Number(b.entitled)]));
    const rows = [];
    for (const s of staff.data ?? []) {
      for (const t of types.data ?? []) {
        const k = `${s.user_id}:${t.id}`;
        if (have.has(k)) continue;
        rows.push({
          company_id: company.id,
          user_id: s.user_id,
          leave_type_id: t.id,
          year,
          entitled: newYearEntitlement(t.code as string, Number(t.days_per_year), prev.get(k) ?? null),
          used: 0,
        });
      }
    }
    if (rows.length) {
      const ins = await db
        .from('leave_balances')
        .upsert(rows, { onConflict: 'user_id,leave_type_id,year', ignoreDuplicates: true })
        .select('user_id');
      if (ins.error) throw new Error(ins.error.message);
      created += ins.data?.length ?? 0;
    }
  }
  return { created };
});
