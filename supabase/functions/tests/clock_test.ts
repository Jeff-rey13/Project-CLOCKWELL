import { assertEquals } from 'jsr:@std/assert@1';
import { effectiveRules, gate, planClock, selfiePathAllowed, type ClockContext, type OfficeRow } from '../_shared/clock.ts';
import { versionBelow } from '../_shared/version.ts';

const office: OfficeRow = {
  id: 'office-hq',
  work_mode: 'onsite',
  timezone: 'Asia/Singapore',
  shift_start: '09:00:00',
  grace_minutes: 5,
  home_days: [],
  require_selfie: true,
  flag_outside: true,
};

const ctx: ClockContext & { office: OfficeRow } = {
  companyStatus: 'active',
  attendanceModule: true,
  profileStatus: 'active',
  office,
  rules: null,
  sites: [{ id: 'site-hq', lat: '1.279400', lng: '103.850500', radius_m: 150 }],
};

// 2026-11-04 is a Wednesday; 09:00 Singapore is 01:00Z.
const at = (iso: string) => new Date(iso);
const atHq = { lat: 1.2795, lng: 103.8506, accuracyM: 12, placeChoice: 'office' as const };

Deno.test('on time at shift start', () => {
  const p = planClock(ctx, { ...atHq, now: at('2026-11-04T01:00:00Z'), deviceTime: at('2026-11-04T01:00:00Z') });
  assertEquals(p.status, 'on_time');
  assertEquals(p.place, 'site');
  assertEquals(p.flags, []);
});

Deno.test('grace exactly at the grace edge', () => {
  const p = planClock(ctx, { ...atHq, now: at('2026-11-04T01:05:00Z'), deviceTime: null });
  assertEquals(p.status, 'grace');
});

Deno.test('late one second after grace', () => {
  const p = planClock(ctx, { ...atHq, now: at('2026-11-04T01:05:01Z'), deviceTime: null });
  assertEquals(p.status, 'late');
});

Deno.test('outside the site is flagged, not blocked', () => {
  const p = planClock(ctx, { ...atHq, lat: 1.3, now: at('2026-11-04T00:55:00Z'), deviceTime: null });
  assertEquals(p.place, 'outside');
  assertEquals(p.flags, ['outside_zone']);
});

Deno.test('office can turn the outside flag off', () => {
  const p = planClock(
    { ...ctx, office: { ...office, flag_outside: false } },
    { ...atHq, lat: 1.3, now: at('2026-11-04T00:55:00Z'), deviceTime: null },
  );
  assertEquals(p.flags, []);
});

Deno.test('gps weak above 100 m', () => {
  const p = planClock(ctx, { ...atHq, accuracyM: 150, now: at('2026-11-04T00:55:00Z'), deviceTime: null });
  assertEquals(p.flags.includes('gps_weak'), true);
});

Deno.test('sent late when the device time is more than 10 minutes behind', () => {
  const p = planClock(ctx, { ...atHq, now: at('2026-11-04T01:20:00Z'), deviceTime: at('2026-11-04T01:09:00Z') });
  assertEquals(p.flags.includes('sent_late'), true);
});

const homeRules = {
  work_mode_override: null,
  shift_start: null,
  grace_minutes: null,
  home_days: null,
  home_lat: 1.35,
  home_lng: 103.94,
  home_radius_m: 200,
  home_status: 'approved' as const,
};

Deno.test('hybrid home day: home is a valid place', () => {
  const p = planClock(
    { ...ctx, office: { ...office, work_mode: 'hybrid', home_days: [3, 5] }, rules: homeRules },
    { lat: 1.3501, lng: 103.9401, accuracyM: 10, placeChoice: 'home', now: at('2026-11-04T00:50:00Z'), deviceTime: null },
  );
  assertEquals(p.place, 'home');
  assertEquals(p.flags, []);
});

Deno.test('remote staff at home on a day not listed is flagged not_home_day', () => {
  const p = planClock(
    { ...ctx, office: { ...office, work_mode: 'remote', home_days: [1] }, rules: homeRules },
    { lat: 1.3501, lng: 103.9401, accuracyM: 10, placeChoice: 'home', now: at('2026-11-04T00:50:00Z'), deviceTime: null },
  );
  assertEquals(p.place, 'home');
  assertEquals(p.flags, ['not_home_day']);
});

Deno.test('home is ignored when the user chose the office', () => {
  const p = planClock(
    { ...ctx, office: { ...office, work_mode: 'hybrid', home_days: [3] }, rules: homeRules },
    { lat: 1.3501, lng: 103.9401, accuracyM: 10, placeChoice: 'office', now: at('2026-11-04T00:50:00Z'), deviceTime: null },
  );
  assertEquals(p.place, 'outside');
});

Deno.test('employee overrides win over office values', () => {
  const r = effectiveRules(office, { ...homeRules, shift_start: '10:00:00', grace_minutes: 0 });
  assertEquals(r.shiftStart, '10:00:00');
  assertEquals(r.graceMinutes, 0);
  assertEquals(r.workMode, 'onsite');
});

Deno.test('gate: inactive, feature off, suspended, selfie required', () => {
  assertEquals(gate({ ...ctx, profileStatus: 'offboarded' }, 'x.webp'), 'NOT_ACTIVE');
  assertEquals(gate({ ...ctx, attendanceModule: false }, 'x.webp'), 'FEATURE_OFF');
  assertEquals(gate({ ...ctx, companyStatus: 'suspended' }, 'x.webp'), 'COMPANY_SUSPENDED');
  assertEquals(gate(ctx, null), 'SELFIE_REQUIRED');
  assertEquals(gate({ ...ctx, office: { ...office, require_selfie: false } }, null), null);
});

Deno.test('selfie path must be in the caller folder', () => {
  assertEquals(selfiePathAllowed('c1/u1/2026-11-04/a.webp', 'c1', 'u1'), true);
  assertEquals(selfiePathAllowed('c2/u1/2026-11-04/a.webp', 'c1', 'u1'), false);
  assertEquals(selfiePathAllowed('c1/u1/../u2/a.webp', 'c1', 'u1'), false);
  assertEquals(selfiePathAllowed('c1/u1/2026-11-04/a.exe', 'c1', 'u1'), false);
});

Deno.test('version compare', () => {
  assertEquals(versionBelow('0.9.0', '0.10.0'), true);
  assertEquals(versionBelow('1.2.0', '1.2.0'), false);
  assertEquals(versionBelow('1.3', '1.2.9'), false);
});
