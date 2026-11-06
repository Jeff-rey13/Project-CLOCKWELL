import { describe, expect, it } from 'vitest';
import { clockInStatus, evaluateClockIn, type EffectiveRules } from './clock-rules.ts';
import type { Zone } from './geo.ts';

const HQ: Zone = { id: 'site-hq', kind: 'site', lat: 1.284, lng: 103.851, radiusM: 150 };
const HOME: Zone = { id: 'home', kind: 'home', lat: 1.35, lng: 103.94, radiusM: 200 };

const onsite: EffectiveRules = {
  workMode: 'onsite',
  timezone: 'Asia/Singapore',
  shiftStart: '09:00',
  graceMinutes: 5,
  homeDays: [],
};
const hybrid: EffectiveRules = { ...onsite, workMode: 'hybrid', homeDays: [3, 5] };

// 2026-11-04 is a Wednesday. 09:00 in Singapore is 01:00Z.
const at = (iso: string) => new Date(iso);

describe('clockInStatus', () => {
  it('is on time at or before shift start', () => {
    expect(clockInStatus(at('2026-11-04T00:55:00Z'), onsite)).toBe('on_time');
    expect(clockInStatus(at('2026-11-04T01:00:00Z'), onsite)).toBe('on_time');
  });
  it('is grace inside the grace period, including exactly at the grace edge', () => {
    expect(clockInStatus(at('2026-11-04T01:00:01Z'), onsite)).toBe('grace');
    expect(clockInStatus(at('2026-11-04T01:05:00Z'), onsite)).toBe('grace');
  });
  it('is late after the grace period', () => {
    expect(clockInStatus(at('2026-11-04T01:05:01Z'), onsite)).toBe('late');
  });
});

describe('evaluateClockIn', () => {
  const base = {
    serverTime: at('2026-11-04T00:50:00Z'),
    deviceTime: at('2026-11-04T00:50:00Z'),
    position: { lat: 1.2848, lng: 103.851 }, // about 90 m north of HQ
    accuracyM: 12,
    sites: [HQ],
    home: HOME,
  };

  it('places the user at the nearest site inside its radius with no flags', () => {
    const r = evaluateClockIn(base, onsite);
    expect(r.place).toBe('site');
    expect(r.zoneId).toBe('site-hq');
    expect(r.distanceM).toBeGreaterThan(80);
    expect(r.distanceM).toBeLessThan(100);
    expect(r.flags).toEqual([]);
    expect(r.workDate).toBe('2026-11-04');
    expect(r.status).toBe('on_time');
  });

  it('flags outside_zone but still records the clock-in', () => {
    const r = evaluateClockIn({ ...base, position: { lat: 1.3, lng: 103.851 } }, onsite);
    expect(r.place).toBe('outside');
    expect(r.flags).toContain('outside_zone');
    expect(r.distanceM).toBeGreaterThan(1500);
  });

  it('does not flag outside_zone in field mode', () => {
    const r = evaluateClockIn(
      { ...base, position: { lat: 1.3, lng: 103.851 } },
      { ...onsite, workMode: 'field' },
    );
    expect(r.flags).not.toContain('outside_zone');
  });

  it('flags gps_weak above 100 m accuracy', () => {
    expect(evaluateClockIn({ ...base, accuracyM: 100 }, onsite).flags).not.toContain('gps_weak');
    expect(evaluateClockIn({ ...base, accuracyM: 101 }, onsite).flags).toContain('gps_weak');
  });

  it('flags sent_late when the server receives it more than 10 minutes after the device time', () => {
    const r = evaluateClockIn({ ...base, deviceTime: at('2026-11-04T00:39:59Z') }, onsite);
    expect(r.flags).toContain('sent_late');
    const ok = evaluateClockIn({ ...base, deviceTime: at('2026-11-04T00:40:00Z') }, onsite);
    expect(ok.flags).not.toContain('sent_late');
  });

  it('accepts home on a hybrid home day', () => {
    const r = evaluateClockIn({ ...base, position: { lat: 1.3505, lng: 103.94 } }, hybrid);
    expect(r.place).toBe('home');
    expect(r.flags).toEqual([]);
  });

  it('treats home as outside on a non-home day for hybrid', () => {
    // 2026-11-05 is a Thursday
    const r = evaluateClockIn(
      { ...base, serverTime: at('2026-11-05T00:50:00Z'), deviceTime: null, position: { lat: 1.3505, lng: 103.94 } },
      hybrid,
    );
    expect(r.place).toBe('outside');
    expect(r.flags).toContain('outside_zone');
  });

  it('flags not_home_day for remote staff at home on a day not listed as a home day', () => {
    const r = evaluateClockIn(
      { ...base, position: { lat: 1.3505, lng: 103.94 } },
      { ...onsite, workMode: 'remote', homeDays: [1, 2] },
    );
    expect(r.place).toBe('home');
    expect(r.flags).toContain('not_home_day');
  });

  it('uses the office time zone for the work date', () => {
    // 23:30Z on 3 Nov is 07:30 on 4 Nov in Singapore
    const r = evaluateClockIn({ ...base, serverTime: at('2026-11-03T23:30:00Z') }, onsite);
    expect(r.workDate).toBe('2026-11-04');
  });
});
