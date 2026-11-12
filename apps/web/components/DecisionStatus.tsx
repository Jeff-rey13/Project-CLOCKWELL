import { Chip } from '@/components/ui/Chip';

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled';

const label: Record<Status, string> = {
  pending: 'Waiting for HR',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** Status chip for leave, claims and time fixes. */
export function DecisionStatus({ status }: { status: Status }) {
  const tone = status === 'approved' ? 'soft' : status === 'rejected' ? 'dark' : 'outline';
  return <Chip tone={tone}>{label[status]}</Chip>;
}
