// Hourly: remind people still clocked in 30 minutes after their shift ended (once per shift).
// Email for now; web push is on the cut-first list (PRD 3.4). Idempotent: clockout_reminded_at.
import { PRODUCT_NAME } from '../_shared/app.ts';
import { admin } from '../_shared/clients.ts';
import { sendEmail } from '../_shared/email.ts';
import { reminderDue } from '../_shared/jobs.ts';
import { job, liveCompanies } from '../_shared/job-runner.ts';

job('clockout-reminders', async () => {
  const db = admin();
  const now = new Date();
  let checked = 0;
  let sent = 0;
  let skipped = 0;

  for (const company of await liveCompanies()) {
    if (company.modules.attendance === false) continue;
    const [open, offices] = await Promise.all([
      db
        .from('attendance')
        .select('id, user_id, work_date, office_id')
        .eq('company_id', company.id)
        .is('clock_out_at', null)
        .is('clockout_reminded_at', null),
      db.from('offices').select('id, timezone, shift_end, clockout_reminder').eq('company_id', company.id),
    ]);
    if (open.error || offices.error) throw new Error('load failed');
    const officeById = new Map(
      (offices.data ?? []).map((o) => [o.id as string, o as { timezone: string; shift_end: string; clockout_reminder: boolean }]),
    );

    for (const shift of open.data ?? []) {
      checked++;
      const office = shift.office_id ? officeById.get(shift.office_id as string) : undefined;
      if (!office) continue;
      const rules = await db.from('employee_rules').select('shift_end').eq('user_id', shift.user_id).maybeSingle();
      const due = reminderDue({
        now,
        timezone: office.timezone,
        shiftEnd: (rules.data?.shift_end as string | null) ?? office.shift_end,
        workDate: shift.work_date as string,
        alreadyReminded: false,
        reminderOn: office.clockout_reminder,
      });
      if (!due) continue;

      // Claim the shift first so two runs never send twice.
      const claimed = await db
        .from('attendance')
        .update({ clockout_reminded_at: now.toISOString() })
        .eq('id', shift.id)
        .is('clockout_reminded_at', null)
        .select('id');
      if (!claimed.data?.length) continue;

      const person = await db.from('profiles').select('full_name, work_email').eq('user_id', shift.user_id).single();
      const ok = person.data
        ? await sendEmail(
            person.data.work_email as string,
            'Remember to clock out',
            `Hi ${(person.data.full_name as string).split(' ')[0]},\n\nYou are still clocked in. If you have finished work, please clock out in ${PRODUCT_NAME}. If you forgot earlier, request a time fix from Attendance.\n`,
          )
        : false;
      if (ok) sent++;
      else skipped++;
    }
  }
  return { checked, sent, skipped_no_email: skipped };
});
