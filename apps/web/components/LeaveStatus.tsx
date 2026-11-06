import { Chip } from '@/components/ui/Chip';
import type { LeaveRequestRow } from '@/lib/queries';

const label: Record<LeaveRequestRow['status'], string> = {
  pending: 'Waiting for HR',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function LeaveStatus({ status }: { status: LeaveRequestRow['status'] }) {
  const tone = status === 'approved' ? 'soft' : status === 'rejected' ? 'dark' : 'outline';
  return <Chip tone={tone}>{label[status]}</Chip>;
}

const dateFmt = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export function leaveRange(r: Pick<LeaveRequestRow, 'start_date' | 'end_date'>): string {
  const a = dateFmt.format(new Date(`${r.start_date}T00:00:00Z`));
  const b = dateFmt.format(new Date(`${r.end_date}T00:00:00Z`));
  return a === b ? a : `${a} to ${b}`;
}

export const fmtDays = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`;
