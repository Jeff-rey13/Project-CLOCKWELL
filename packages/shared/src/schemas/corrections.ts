import { z } from 'zod';

export const CORRECTION_REASONS = ['device_delay', 'forgot', 'manager_approved', 'other'] as const;
export const correctionReasonLabel: Record<(typeof CORRECTION_REASONS)[number], string> = {
  device_delay: 'Phone or app was slow',
  forgot: 'Forgot to clock',
  manager_approved: 'Approved by manager',
  other: 'Other',
};

const base = {
  attendance_id: z.string().uuid(),
  field: z.enum(['clock_in', 'clock_out']),
  corrected_at: z.string().datetime({ offset: true }),
  reason_code: z.enum(CORRECTION_REASONS),
  note: z.string().trim().max(500).optional().default(''),
};

/** Employee asks for a time fix. */
export const correctionRequestSchema = z.object(base);

/** HR either decides a pending request or adjusts a shift directly. */
export const correctAttendanceSchema = z.union([
  z.object({ correction_id: z.string().uuid(), approve: z.boolean() }),
  z.object(base),
]);

/** Local date and HH:MM in a time zone to an ISO instant (handles the zone's offset at that date). */
export function zonedToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocal = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asLocal - guess)).toISOString();
}
