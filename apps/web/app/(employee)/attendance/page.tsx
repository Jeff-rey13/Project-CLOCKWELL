'use client';

import { useSyncExternalStore } from 'react';
import { AttendanceList } from '@/components/AttendanceList';
import { PreviewNote } from '@/components/layout/PreviewNote';
import { demoAttendance, type DemoAttendanceRow } from '@/lib/demo-data';
import { getDoneShifts, subscribe } from '@/lib/preview-shift';

const noShifts: DemoAttendanceRow[] = [];
const monthFmt = new Intl.DateTimeFormat('en-SG', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function AttendancePage() {
  const doneShifts = useSyncExternalStore(subscribe, getDoneShifts, () => noShifts);
  const byMonth = new Map<string, DemoAttendanceRow[]>();
  for (const row of [...doneShifts, ...demoAttendance]) {
    const key = row.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  }

  return (
    <>
      <PreviewNote />
      <h1 className="mb-4 text-2xl">Attendance</h1>
      <div className="flex flex-col gap-6">
        {[...byMonth.entries()].map(([month, rows]) => (
          <section key={month} aria-label={month}>
            <h2 className="mb-2 text-sm font-semibold text-muted">
              {monthFmt.format(new Date(`${month}-01T00:00:00Z`))}
            </h2>
            <AttendanceList rows={rows} />
          </section>
        ))}
      </div>
    </>
  );
}
