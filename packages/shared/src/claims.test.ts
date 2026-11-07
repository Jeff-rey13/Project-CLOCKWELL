import { describe, expect, it } from 'vitest';
import { claimFits, claimRemaining, claimSubmitSchema } from './schemas/claims.ts';

const limits = { annualLimit: 500, perClaimLimit: 80, approvedThisYear: 300, pendingThisYear: 42 };

describe('claim limits', () => {
  it('remaining counts approved and pending', () => {
    expect(claimRemaining(limits)).toBe(158);
  });
  it('refuses over the per-claim limit', () => {
    expect(claimFits(limits, 80)).toBe(true);
    expect(claimFits(limits, 80.01)).toBe(false);
  });
  it('refuses over the yearly limit', () => {
    expect(claimFits({ ...limits, perClaimLimit: null }, 158)).toBe(true);
    expect(claimFits({ ...limits, perClaimLimit: null }, 158.01)).toBe(false);
  });
  it('never goes below zero', () => {
    expect(claimRemaining({ ...limits, approvedThisYear: 600 })).toBe(0);
  });
});

describe('claim schema', () => {
  const ok = {
    client_request_id: '7b0c3a5e-2f1d-4c7e-9a3b-1d2e3f4a5b6c',
    clinic: 'Raffles Medical',
    visit_date: '2026-11-02',
    amount: 42.5,
    receipt_paths: ['c/u/x/r.jpg'],
  };
  it('accepts a valid claim', () => {
    expect(claimSubmitSchema.safeParse(ok).success).toBe(true);
  });
  it('needs a receipt and a sensible amount', () => {
    expect(claimSubmitSchema.safeParse({ ...ok, receipt_paths: [] }).success).toBe(false);
    expect(claimSubmitSchema.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(claimSubmitSchema.safeParse({ ...ok, amount: 1.234 }).success).toBe(false);
  });
});
