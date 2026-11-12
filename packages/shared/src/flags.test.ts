import { describe, expect, it } from 'vitest';
import { resolveFlag, setFlagSchema } from './flags.ts';

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';

describe('resolveFlag', () => {
  it('uses the built-in default when nothing is set', () => {
    expect(resolveFlag([], 'clockout_push', A)).toBe(false);
    expect(resolveFlag([], 'offline_clock_in', A)).toBe(true);
  });
  it('global value overrides the default', () => {
    expect(resolveFlag([{ key: 'clockout_push', company_id: null, enabled: true }], 'clockout_push', A)).toBe(true);
  });
  it('company value overrides the global value', () => {
    const rows = [
      { key: 'clockout_push', company_id: null, enabled: true },
      { key: 'clockout_push', company_id: A, enabled: false },
    ];
    expect(resolveFlag(rows, 'clockout_push', A)).toBe(false);
    expect(resolveFlag(rows, 'clockout_push', B)).toBe(true);
  });
});

describe('setFlagSchema', () => {
  it('accepts a known key and refuses an unknown one', () => {
    expect(setFlagSchema.safeParse({ action: 'set_flag', key: 'clockout_push', company_id: null, enabled: true }).success).toBe(true);
    expect(setFlagSchema.safeParse({ action: 'set_flag', key: 'nope', company_id: null, enabled: true }).success).toBe(false);
  });
});
