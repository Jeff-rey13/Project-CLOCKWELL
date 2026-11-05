/**
 * Sample data for the preview build, matching the seed in docs/PRD.md section 9.
 * Used only until the screens are wired to Supabase (tasks 1.6 to 1.8).
 */
import type { AttendanceFlag, AttendanceStatus, EffectiveRules, Zone } from '@app/shared';

export const demoCompany = {
  slug: 'harbourline',
  name: 'Harbourline Logistics',
};

export const demoUser = {
  fullName: 'Aisyah Rahman',
  firstName: 'Aisyah',
  employeeCode: 'HL-0142',
  department: 'Operations',
  office: 'HQ',
  appRole: 'employee' as const,
};

export const demoRules: EffectiveRules = {
  workMode: 'onsite',
  timezone: 'Asia/Singapore',
  shiftStart: '09:00',
  graceMinutes: 5,
  homeDays: [],
};

export const demoShift = { start: '09:00', end: '18:00' };

export const demoSites: Zone[] = [
  { id: 'site-hq', kind: 'site', lat: 1.2794, lng: 103.8505, radiusM: 150 },
];
export const demoSiteNames: Record<string, string> = { 'site-hq': 'HQ, Marina View' };

export const demoTiles = {
  daysPresent: 3,
  annualLeft: 11.5,
  sickLeft: 14,
  claimsPending: 1,
};

export interface DemoAttendanceRow {
  date: string;
  clockIn: string;
  clockOut: string | null;
  status: AttendanceStatus;
  flags: AttendanceFlag[];
  corrected: boolean;
}

export const demoAttendance: DemoAttendanceRow[] = [
  { date: '2026-11-04', clockIn: '08:52', clockOut: '18:06', status: 'on_time', flags: [], corrected: false },
  { date: '2026-11-03', clockIn: '09:04', clockOut: '18:01', status: 'grace', flags: [], corrected: false },
  { date: '2026-11-02', clockIn: '09:21', clockOut: '18:15', status: 'late', flags: ['outside_zone'], corrected: false },
  { date: '2026-10-30', clockIn: '08:47', clockOut: '17:58', status: 'on_time', flags: [], corrected: true },
  { date: '2026-10-29', clockIn: '08:55', clockOut: '18:03', status: 'on_time', flags: [], corrected: false },
];

export const demoHr = {
  inToday: 41,
  headcount: 52,
  kpis: { inOffice: 37, onLeave: 4, notClockedIn: 7, late: 3, flagged: 2 },
  waiting: [
    { id: 'w1', who: 'Daniel Tan', what: 'Annual leave, 12 to 14 Nov (3 days)' },
    { id: 'w2', who: 'Priya Nair', what: 'Medical claim, SGD 48.00' },
    { id: 'w3', who: 'Wei Jie Lim', what: 'Time fix, clock-in 3 Nov to 08:58' },
  ],
  latest: [
    { id: 'c1', who: 'Aisyah Rahman', time: '08:52', status: 'on_time' as AttendanceStatus, flagged: false },
    { id: 'c2', who: 'Marcus Goh', time: '09:03', status: 'grace' as AttendanceStatus, flagged: false },
    { id: 'c3', who: 'Siti Hassan', time: '09:17', status: 'late' as AttendanceStatus, flagged: true },
    { id: 'c4', who: 'Daniel Tan', time: '08:41', status: 'on_time' as AttendanceStatus, flagged: false },
  ],
};
