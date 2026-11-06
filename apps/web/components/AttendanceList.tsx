import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { localTime, type AttendanceRow } from '@/lib/queries';

const dateFmt = new Intl.DateTimeFormat('en-SG', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function AttendanceList({
  rows,
  timezone,
  loading,
  failed,
}: {
  rows: AttendanceRow[] | undefined;
  timezone: string;
  loading?: boolean;
  failed?: boolean;
}) {
  if (loading) return <ListSkeleton rows={3} />;
  if (failed) {
    return <EmptyState title="Could not load attendance" body="Check your connection and try again." />;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState title="No attendance yet" body="Your clock-ins will show here." />;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{dateFmt.format(new Date(`${r.work_date}T00:00:00Z`))}</p>
            <p className="font-mono text-xs text-muted">
              {localTime(r.effective_clock_in_at, timezone)} to{' '}
              {r.effective_clock_out_at ? localTime(r.effective_clock_out_at, timezone) : 'now'}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <StatusChip status={r.status} />
            {r.is_corrected ? <Chip tone="outline">Corrected</Chip> : null}
            {r.clock_in_place === 'home' ? <Chip tone="outline">Home</Chip> : null}
            {r.flags.includes('outside_zone') ? <Chip tone="danger">Check location</Chip> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
