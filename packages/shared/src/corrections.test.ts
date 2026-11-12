import { describe, expect, it } from 'vitest';
import { correctAttendanceSchema, zonedToIso } from './schemas/corrections.ts';

describe('zonedToIso', () => {
  it('converts Singapore local time to UTC', () => {
    expect(zonedToIso('2026-11-04', '08:58', 'Asia/Singapore')).toBe('2026-11-04T00:58:00.000Z');
  });
  it('handles the previous UTC day', () => {
    expect(zonedToIso('2026-11-04', '07:30', 'Asia/Singapore')).toBe('2026-11-03T23:30:00.000Z');
  });
  it('handles a zone with daylight saving', () => {
    expect(zonedToIso('2026-07-01', '09:00', 'Europe/London')).toBe('2026-07-01T08:00:00.000Z');
  });
});

describe('correctAttendanceSchema', () => {
  it('accepts a decision', () => {
    expect(
      correctAttendanceSchema.safeParse({ correction_id: '7b0c3a5e-2f1d-4c7e-9a3b-1d2e3f4a5b6c', approve: true }).success,
    ).toBe(true);
  });
  it('accepts a direct adjustment', () => {
    expect(
      correctAttendanceSchema.safeParse({
        attendance_id: '7b0c3a5e-2f1d-4c7e-9a3b-1d2e3f4a5b6c',
        field: 'clock_in',
        corrected_at: '2026-11-04T00:58:00.000Z',
        reason_code: 'manager_approved',
      }).success,
    ).toBe(true);
  });
});
