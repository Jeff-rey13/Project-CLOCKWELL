import { z } from 'zod';

/** What the support team may look at, read-only, while a company has granted access. */
export const SUPPORT_VIEWS = ['employees', 'attendance', 'leave', 'claims', 'offices'] as const;
export type SupportView = (typeof SUPPORT_VIEWS)[number];

export const supportViewSchema = z.object({
  company_id: z.string().uuid(),
  view: z.enum(SUPPORT_VIEWS),
  /** For the attendance view: the day to show (yyyy-mm-dd). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const supportViewLabel: Record<SupportView, string> = {
  employees: 'Employees',
  attendance: 'Attendance',
  leave: 'Leave',
  claims: 'Claims',
  offices: 'Offices',
};
