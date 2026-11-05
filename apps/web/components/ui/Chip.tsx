import type { AttendanceStatus } from '@app/shared';
import { cn } from '@/lib/cn';

type Tone = 'soft' | 'dark' | 'outline' | 'danger';

const tones: Record<Tone, string> = {
  soft: 'bg-soft text-fg border border-line',
  dark: 'bg-dark-chip text-white',
  outline: 'border border-line-strong text-fg',
  danger: 'bg-danger-soft text-danger',
};

export function Chip({ tone = 'soft', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

const statusLabel: Record<AttendanceStatus, string> = {
  on_time: 'On time',
  grace: 'On time (grace)',
  late: 'Late',
};

export function StatusChip({ status }: { status: AttendanceStatus }) {
  return <Chip tone={status === 'late' ? 'dark' : 'soft'}>{statusLabel[status]}</Chip>;
}
