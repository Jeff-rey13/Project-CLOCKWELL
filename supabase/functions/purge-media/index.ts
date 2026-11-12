// Hourly: apply each company's retention settings (PDPA).
// Selfies older than selfie_retention_days are deleted from storage and unlinked.
// Records older than record_retention_days are deleted (attendance with its corrections, absences,
// decided leave and claims with their receipts). Idempotent: only acts on what is still there.
import { admin } from '../_shared/clients.ts';
import { retentionCutoff } from '../_shared/jobs.ts';
import { job, liveCompanies } from '../_shared/job-runner.ts';

const BATCH = 500;

async function removeFiles(bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const r = await admin().storage.from(bucket).remove(chunk);
    if (r.error) throw new Error(r.error.message);
    removed += r.data?.length ?? 0;
  }
  return removed;
}

job('purge-media', async () => {
  const db = admin();
  const now = new Date();
  const totals = { selfies: 0, attendance: 0, absences: 0, leave: 0, claims: 0, receipts: 0 };

  for (const company of await liveCompanies()) {
    const settings = await db
      .from('company_settings')
      .select('selfie_retention_days, record_retention_days')
      .eq('company_id', company.id)
      .single();
    if (settings.error) throw new Error(settings.error.message);
    const selfieCutoff = retentionCutoff(now, settings.data.selfie_retention_days as number);
    const recordCutoff = retentionCutoff(now, settings.data.record_retention_days as number);

    // Selfies.
    const old = await db
      .from('attendance')
      .select('id, clock_in_selfie_path, clock_out_selfie_path')
      .eq('company_id', company.id)
      .lt('clock_in_at', selfieCutoff)
      .or('clock_in_selfie_path.not.is.null,clock_out_selfie_path.not.is.null')
      .limit(BATCH);
    if (old.error) throw new Error(old.error.message);
    const paths = (old.data ?? []).flatMap((r) => [r.clock_in_selfie_path, r.clock_out_selfie_path]).filter(Boolean) as string[];
    if (paths.length) {
      totals.selfies += await removeFiles('selfies', paths);
      const ids = (old.data ?? []).map((r) => r.id as string);
      const u = await db.from('attendance').update({ clock_in_selfie_path: null, clock_out_selfie_path: null }).in('id', ids);
      if (u.error) throw new Error(u.error.message);
    }

    // Records.
    const recordDate = recordCutoff.slice(0, 10);
    const att = await db.from('attendance').delete().eq('company_id', company.id).lt('clock_in_at', recordCutoff).select('id');
    if (att.error) throw new Error(att.error.message);
    totals.attendance += att.data?.length ?? 0;

    const abs = await db.from('absences').delete().eq('company_id', company.id).lt('work_date', recordDate).select('id');
    if (abs.error) throw new Error(abs.error.message);
    totals.absences += abs.data?.length ?? 0;

    const lv = await db
      .from('leave_requests')
      .delete()
      .eq('company_id', company.id)
      .in('status', ['approved', 'rejected', 'cancelled'])
      .lt('end_date', recordDate)
      .select('id');
    if (lv.error) throw new Error(lv.error.message);
    totals.leave += lv.data?.length ?? 0;

    const claims = await db
      .from('medical_claims')
      .select('id, receipt_paths')
      .eq('company_id', company.id)
      .in('status', ['approved', 'rejected'])
      .lt('visit_date', recordDate)
      .limit(BATCH);
    if (claims.error) throw new Error(claims.error.message);
    const receipts = (claims.data ?? []).flatMap((c) => (c.receipt_paths as string[]) ?? []);
    if (receipts.length) totals.receipts += await removeFiles('receipts', receipts);
    if (claims.data?.length) {
      const d = await db.from('medical_claims').delete().in('id', claims.data.map((c) => c.id as string)).select('id');
      if (d.error) throw new Error(d.error.message);
      totals.claims += d.data?.length ?? 0;
    }
  }
  return totals;
});
