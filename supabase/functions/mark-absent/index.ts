// Hourly: for each company, record absences for yesterday (its time zone) once that day has ended.
// Idempotent: one absence per person per day (unique key).
import { admin } from '../_shared/clients.ts';
import { absentees, isWorkingDay, yesterdayIn } from '../_shared/jobs.ts';
import { job, liveCompanies } from '../_shared/job-runner.ts';

job('mark-absent', async () => {
  const db = admin();
  const now = new Date();
  let companies = 0;
  let marked = 0;

  for (const company of await liveCompanies()) {
    if (company.modules.attendance === false) continue;
    const date = yesterdayIn(now, company.timezone);
    const holidays = await db.from('holidays').select('date').eq('company_id', company.id).eq('date', date);
    if (!isWorkingDay(date, new Set((holidays.data ?? []).map((h) => h.date as string)))) continue;
    companies++;

    const [staff, shifts, leave] = await Promise.all([
      db.from('profiles').select('user_id, start_date').eq('company_id', company.id).eq('status', 'active'),
      db.from('attendance').select('user_id').eq('company_id', company.id).eq('work_date', date),
      db
        .from('leave_requests')
        .select('user_id')
        .eq('company_id', company.id)
        .eq('status', 'approved')
        .lte('start_date', date)
        .gte('end_date', date),
    ]);
    if (staff.error || shifts.error || leave.error) throw new Error('load failed');

    const absent = absentees({
      date,
      staff: (staff.data ?? []) as Array<{ user_id: string; start_date: string | null }>,
      clockedIn: new Set((shifts.data ?? []).map((s) => s.user_id as string)),
      onLeave: new Set((leave.data ?? []).map((l) => l.user_id as string)),
    });
    if (absent.length === 0) continue;
    const ins = await db
      .from('absences')
      .upsert(
        absent.map((user_id) => ({ company_id: company.id, user_id, work_date: date })),
        { onConflict: 'user_id,work_date', ignoreDuplicates: true },
      )
      .select('id');
    if (ins.error) throw new Error(ins.error.message);
    marked += ins.data?.length ?? 0;
  }
  return { companies, marked };
});
