import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DemoAttendanceRow } from '@/lib/demo-data';

const dateFmt = new Intl.DateTimeFormat('en-SG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function AttendanceList({ rows }: { rows: DemoAttendanceRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="No attendance yet" body="Your clock-ins will show here." />;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {rows.map((r, i) => (
        <li key={`${r.date}-${r.clockIn}-${i}`}className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{dateFmt.format(new Date(`${r.date}T00:00:00Z`))}</p>
            <p className="font-mono text-xs text-muted">
              {r.clockIn} to {r.clockOut ?? 'now'}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <StatusChip status={r.status} />
            {r.corrected ? <Chip tone="outline">Corrected</Chip> : null}
            {r.flags.includes('outside_zone') ? <Chip tone="danger">Check location</Chip> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
