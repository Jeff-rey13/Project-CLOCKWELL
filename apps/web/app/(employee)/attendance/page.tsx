'use client';

import { useState } from 'react';
import { AttendanceList } from '@/components/AttendanceList';
import { CorrectionForm } from '@/components/CorrectionForm';
import { Sheet } from '@/components/ui/Sheet';
import { useAttendance, useWorkplace, type AttendanceRow } from '@/lib/queries';

const monthFmt = new Intl.DateTimeFormat('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function AttendancePage() {
  const attendance = useAttendance();
  const workplace = useWorkplace();
  const tz = workplace.data?.office.timezone ?? 'Asia/Singapore';
  const [fixing, setFixing] = useState<AttendanceRow | null>(null);

  const byMonth = new Map<string, AttendanceRow[]>();
  for (const row of attendance.data ?? []) {
    const key = row.work_date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }

  return (
    <>
      <h1 className="mb-1 text-2xl">Attendance</h1>
      <p className="mb-4 text-sm text-muted">Times are recorded by the server. If one is wrong, request a fix and HR will review it.</p>
      {attendance.isLoading || attendance.isError || byMonth.size === 0 ? (
        <AttendanceList rows={[]} timezone={tz} loading={attendance.isLoading} failed={attendance.isError} />
      ) : (
        <div className="flex flex-col gap-6">
          {[...byMonth.entries()].map(([month, rows]) => (
            <section key={month} aria-label={month}>
              <h2 className="mb-2 text-sm font-semibold text-muted">
                {monthFmt.format(new Date(`${month}-01T00:00:00Z`))}
              </h2>
              <AttendanceList rows={rows} timezone={tz} onFix={setFixing} />
            </section>
          ))}
        </div>
      )}
      <Sheet open={fixing !== null} title="Request a time fix" onClose={() => setFixing(null)}>
        {fixing ? <CorrectionForm shift={fixing} mode="request" timezone={tz} onDone={() => setFixing(null)} /> : null}
      </Sheet>
    </>
  );
}
