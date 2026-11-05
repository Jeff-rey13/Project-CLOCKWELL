import { describe, expect, it } from 'vitest';
import { haversineMeters } from './geo';
import { countLeaveDays } from './leave-days';
import { ERRORS, ERROR_CODES, toErrorCode } from './errors';
import { clockEventSchema } from './schemas/clock';
import { loginSchema } from './schemas/auth';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 1.3, lng: 103.8 }, { lat: 1.3, lng: 103.8 })).toBe(0);
  });
  it('matches a known distance (about 111 km per degree of latitude)', () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });
});

describe('countLeaveDays', () => {
  it('skips weekends', () => {
    expect(countLeaveDays('2026-11-02', '2026-11-08', [], false)).toBe(5);
  });
  it('skips company holidays', () => {
    expect(countLeaveDays('2026-11-02', '2026-11-08', ['2026-11-04'], false)).toBe(4);
  });
  it('takes off half a day when the last day is a half day', () => {
    expect(countLeaveDays('2026-11-02', '2026-11-06', [], true)).toBe(4.5);
  });
  it('ignores the half day when the last day is not a working day', () => {
    expect(countLeaveDays('2026-11-02', '2026-11-08', [], true)).toBe(5);
  });
  it('returns 0 for a reversed range', () => {
    expect(countLeaveDays('2026-11-06', '2026-11-02', [], false)).toBe(0);
  });
});

describe('errors', () => {
  it('has a message and next step for every code', () => {
    for (const code of ERROR_CODES) {
      expect(ERRORS[code].message.length).toBeGreaterThan(0);
      expect(ERRORS[code].nextStep.length).toBeGreaterThan(0);
    }
  });
  it('maps unknown values to SERVER_ERROR', () => {
    expect(toErrorCode('duplicate key value violates unique constraint')).toBe('SERVER_ERROR');
    expect(toErrorCode('LEAVE_OVERLAP')).toBe('LEAVE_OVERLAP');
  });
});

describe('schemas', () => {
  it('accepts a valid clock event', () => {
    const r = clockEventSchema.safeParse({
      client_request_id: '7b0c3a5e-2f1d-4c7e-9a3b-1d2e3f4a5b6c',
      lat: 1.284,
      lng: 103.851,
      accuracy_m: 10,
      selfie_path: 'c/u/2026-11-04/x.webp',
      device_time: '2026-11-04T09:00:00+08:00',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.place_choice).toBe('office');
  });
  it('rejects bad coordinates', () => {
    const r = clockEventSchema.safeParse({
      client_request_id: '7b0c3a5e-2f1d-4c7e-9a3b-1d2e3f4a5b6c',
      lat: 95,
      lng: 103.851,
      accuracy_m: 10,
      selfie_path: null,
      device_time: '2026-11-04T09:00:00+08:00',
    });
    expect(r.success).toBe(false);
  });
  it('rejects an uppercase company slug', () => {
    expect(loginSchema.safeParse({ slug: 'Harbour', username: 'a', password: 'b' }).success).toBe(false);
  });
});
