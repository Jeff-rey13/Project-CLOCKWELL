import { z } from 'zod';

export const WORK_MODES = ['onsite', 'hybrid', 'remote', 'field'] as const;
export const workModeLabel: Record<(typeof WORK_MODES)[number], string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Work from home',
  field: 'Field / any site',
};
export const TIMEZONES = ['Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Manila'] as const;
export const WEEKDAYS = [
  { n: 1, short: 'Mon' },
  { n: 2, short: 'Tue' },
  { n: 3, short: 'Wed' },
  { n: 4, short: 'Thu' },
  { n: 5, short: 'Fri' },
  { n: 6, short: 'Sat' },
  { n: 7, short: 'Sun' },
] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM');
const homeDays = z.array(z.number().int().min(1).max(7)).max(7);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const officeSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'Enter a name').max(80),
    work_mode: z.enum(WORK_MODES),
    timezone: z.enum(TIMEZONES),
    shift_start: time,
    shift_end: time,
    grace_minutes: z.number().int().min(0).max(120),
    home_days: homeDays,
    require_selfie: z.boolean(),
    flag_outside: z.boolean(),
    clockout_reminder: z.boolean(),
    count_overtime: z.boolean(),
  })
  .refine((o) => o.work_mode === 'hybrid' || o.home_days.length === 0 || o.work_mode === 'remote', {
    message: 'Home days apply to hybrid and work-from-home offices only',
    path: ['home_days'],
  });

export const siteSchema = z.object({
  id: z.string().uuid().optional(),
  office_id: z.string().uuid(),
  name: z.string().trim().min(1, 'Enter a name').max(80),
  lat,
  lng,
  radius_m: z.number().int().min(25, 'At least 25 m').max(2000, 'At most 2,000 m'),
  delete: z.boolean().optional().default(false),
});

export const employeeRulesSchema = z.object({
  user_id: z.string().uuid(),
  work_mode_override: z.enum(WORK_MODES).nullable(),
  shift_start: time.nullable(),
  shift_end: time.nullable(),
  grace_minutes: z.number().int().min(0).max(120).nullable(),
  home_days: homeDays.nullable(),
  home_lat: lat.nullable(),
  home_lng: lng.nullable(),
  home_radius_m: z.number().int().min(25).max(2000),
});

export const homeLocationRequestSchema = z.object({
  lat,
  lng,
  accuracy_m: z.number().nonnegative().max(100_000),
});

export const homeLocationDecisionSchema = z.object({
  user_id: z.string().uuid(),
  approve: z.boolean(),
});
