import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');

export const leaveRequestSchema = z
  .object({
    client_request_id: z.string().uuid(),
    leave_type_id: z.string().uuid(),
    start_date: isoDate,
    end_date: isoDate,
    half_day_end: z.boolean().default(false),
    reason: z.string().trim().max(500).optional().default(''),
    attachment_path: z.string().min(1).max(300).nullable().default(null),
  })
  .refine((v) => v.end_date >= v.start_date, { message: 'End date is before start date', path: ['end_date'] })
  .refine((v) => v.start_date.slice(0, 4) === v.end_date.slice(0, 4), {
    message: 'Leave must start and end in the same year',
    path: ['end_date'],
  });

export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const leaveCancelSchema = z.object({ request_id: z.string().uuid() });

export const leaveDecisionSchema = z.object({
  request_id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional().default(''),
});

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
