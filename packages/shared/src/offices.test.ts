import { describe, expect, it } from 'vitest';
import { officeSchema, siteSchema } from './schemas/offices.ts';

const office = {
  name: 'Tuas',
  work_mode: 'hybrid' as const,
  timezone: 'Asia/Singapore' as const,
  shift_start: '09:00',
  shift_end: '18:00',
  grace_minutes: 5,
  home_days: [3, 5],
  require_selfie: true,
  flag_outside: true,
  clockout_reminder: true,
  count_overtime: false,
};

describe('officeSchema', () => {
  it('accepts a hybrid office with home days', () => {
    expect(officeSchema.safeParse(office).success).toBe(true);
  });
  it('refuses home days on an on-site office', () => {
    expect(officeSchema.safeParse({ ...office, work_mode: 'onsite' }).success).toBe(false);
  });
  it('refuses a bad shift time', () => {
    expect(officeSchema.safeParse({ ...office, shift_start: '25:00' }).success).toBe(false);
  });
});

describe('siteSchema', () => {
  const site = { office_id: '30000000-0000-4000-8000-000000000001', name: 'Gate A', lat: 1.28, lng: 103.85, radius_m: 150 };
  it('accepts a site', () => {
    expect(siteSchema.safeParse(site).success).toBe(true);
  });
  it('keeps the radius between 25 m and 2 km', () => {
    expect(siteSchema.safeParse({ ...site, radius_m: 10 }).success).toBe(false);
    expect(siteSchema.safeParse({ ...site, radius_m: 2500 }).success).toBe(false);
  });
});
