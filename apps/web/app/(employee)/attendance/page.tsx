'use client';

import { AttendanceList } from '@/components/AttendanceList';
import { useAttendance, useWorkplace, type AttendanceRow } from '@/lib/queries';

const monthFmt = new Intl.DateTimeFormat('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function AttendancePage() {
  const attendance = useAttendance();
  const workplace = useWorkplace();
  const tz = workplace.data?.office.timezone ?? 'Asia/Singapore';

  const byMonth = new Map<string, AttendanceRow[]>();
  for (const row of attendance.data ?? []) {
    const key = row.work_date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }

  return (
    <>
      <h1 className="mb-4 text-2xl">Attendance</h1>
      {attendance.isLoading || attendance.isError || byMonth.size === 0 ? (
        <AttendanceList rows={[]} timezone={tz} loading={attendance.isLoading} failed={attendance.isError} />
      ) : (
        <div className="flex flex-col gap-6">
          {[...byMonth.entries()].map(([month, rows]) => (
            <section key={month} aria-label={month}>
              <h2 className="mb-2 text-sm font-semibold text-muted">
                {monthFmt.format(new Date(`${month}-01T00:00:00Z`))}
              </h2>
              <AttendanceList rows={rows} timezone={tz} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
