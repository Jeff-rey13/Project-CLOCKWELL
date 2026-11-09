import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');

export const inviteEmployeeSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the full name').max(120),
  work_email: z.string().trim().toLowerCase().email('Enter a valid work email').max(200),
  department: z.string().trim().max(80).optional().default(''),
  office_id: z.string().uuid('Choose an office'),
  start_date: isoDate,
  annual_leave: z.number().min(0).max(60),
  app_role: z.enum(['employee', 'hr']).default('employee'),
});
export type InviteEmployeeInput = z.infer<typeof inviteEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  department: z.string().trim().max(80).optional().default(''),
  office_id: z.string().uuid(),
  start_date: isoDate,
  app_role: z.enum(['employee', 'hr']),
});

export const offboardEmployeeSchema = z.object({ user_id: z.string().uuid() });

/** Username from the first name: lowercase letters only, then a number if taken. */
export function suggestUsername(fullName: string, taken: ReadonlySet<string>): string {
  const base =
    (fullName.trim().split(/\s+/)[0] ?? '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20) || 'user';
  const stem = base.length < 2 ? `${base}x` : base;
  if (!taken.has(stem)) return stem;
  for (let i = 2; i < 10_000; i++) {
    if (!taken.has(`${stem}${i}`)) return `${stem}${i}`;
  }
  return `${stem}${Date.now()}`;
}

/** Next employee code: keeps the company's prefix (e.g. "HL-") and adds one to the highest number. */
export function nextEmployeeCode(existing: readonly string[], fallbackPrefix: string): string {
  let prefix = `${fallbackPrefix}-`;
  let max = 0;
  let width = 4;
  for (const code of existing) {
    const m = /^(.*?)(\d+)$/.exec(code);
    if (!m) continue;
    const n = Number(m[2]);
    if (n >= max) {
      max = n;
      prefix = m[1] ?? prefix;
      width = Math.max(width, (m[2] ?? '').length);
    }
  }
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}
