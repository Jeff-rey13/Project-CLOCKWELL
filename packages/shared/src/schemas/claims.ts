import { z } from 'zod';

export const claimSubmitSchema = z.object({
  client_request_id: z.string().uuid(),
  clinic: z.string().trim().min(1, 'Enter the clinic name').max(120),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the visit date'),
  amount: z
    .number({ invalid_type_error: 'Enter the amount' })
    .positive('Enter an amount above zero')
    .max(100_000)
    .refine((n) => Math.round(n * 100) === n * 100, 'Use at most 2 decimal places'),
  receipt_paths: z.array(z.string().min(1).max(300)).min(1, 'Add a receipt').max(5),
});

export type ClaimSubmitInput = z.infer<typeof claimSubmitSchema>;

export const claimDecisionSchema = z.object({
  claim_id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional().default(''),
});

export interface ClaimLimits {
  annualLimit: number;
  perClaimLimit: number | null;
  approvedThisYear: number;
  pendingThisYear: number;
}

/** Remaining yearly amount, counting pending claims as held. */
export function claimRemaining(l: ClaimLimits): number {
  return Math.max(0, Math.round((l.annualLimit - l.approvedThisYear - l.pendingThisYear) * 100) / 100);
}

/** True when a new claim of this amount fits the per-claim and yearly limits. */
export function claimFits(l: ClaimLimits, amount: number): boolean {
  if (l.perClaimLimit !== null && amount > l.perClaimLimit) return false;
  return amount <= claimRemaining(l) + 1e-9;
}
