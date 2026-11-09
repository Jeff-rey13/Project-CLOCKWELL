import { z } from 'zod';

export const companySettingsSchema = z.object({
  name: z.string().trim().min(2, 'Enter the company name').max(120),
  logo_path: z.string().max(300).nullable(),
  selfie_retention_days: z.number().int().min(7, 'At least 7 days').max(3650),
  record_retention_days: z.number().int().min(30, 'At least 30 days').max(3650),
});

export const supportGrantSchema = z.object({
  reason: z.string().trim().min(5, 'Say why support needs access').max(300),
  ticket_ref: z.string().trim().max(60).optional().default(''),
  days: z.number().int().min(1).max(7),
});

export const supportRevokeSchema = z.object({ grant_id: z.string().uuid() });
