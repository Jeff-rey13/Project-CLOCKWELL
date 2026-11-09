import { z } from 'zod';
import { companySlug } from './auth.ts';

export const PLANS = ['starter', 'business', 'enterprise'] as const;
export const RELEASE_TRACKS = ['pilot', 'stable'] as const;
export const MODULES = ['attendance', 'leave', 'claims', 'payroll_export'] as const;

/** Slugs that cannot be used for a company (they are app addresses). */
export const RESERVED_SLUGS = ['platform', 'www', 'app', 'api', 'admin', 'login', 'staging', 'status'];

export const platformCompanySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(2, 'Enter the company name').max(120),
    slug: companySlug.refine((s) => !RESERVED_SLUGS.includes(s), 'That address is reserved'),
    plan: z.enum(PLANS),
    seat_limit: z.number().int().min(1).max(100_000),
    release_track: z.enum(RELEASE_TRACKS),
    hr_full_name: z.string().trim().min(2, 'Enter the HR admin name').max(120),
    hr_email: z.string().trim().toLowerCase().email('Enter a valid email'),
  }),
  z.object({
    action: z.literal('update'),
    company_id: z.string().uuid(),
    plan: z.enum(PLANS),
    seat_limit: z.number().int().min(1).max(100_000),
    release_track: z.enum(RELEASE_TRACKS),
    modules: z.record(z.enum(MODULES), z.boolean()),
  }),
  z.object({ action: z.literal('suspend'), company_id: z.string().uuid() }),
  z.object({ action: z.literal('activate'), company_id: z.string().uuid() }),
  z.object({ action: z.literal('request_deletion'), company_id: z.string().uuid() }),
  z.object({ action: z.literal('approve_deletion'), company_id: z.string().uuid() }),
  z.object({ action: z.literal('cancel_deletion'), company_id: z.string().uuid() }),
]);

export type PlatformCompanyInput = z.infer<typeof platformCompanySchema>;

/** Days between a deletion being approved and the data being removed. */
export const DELETION_GRACE_DAYS = 30;
