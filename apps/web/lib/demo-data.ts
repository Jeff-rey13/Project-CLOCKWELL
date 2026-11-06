/**
 * Sample figures for the HR dashboard preview only, marked "Preview build" on screen.
 * Replaced by the dashboard SQL function and Realtime feed in task 2.3.
 */
import type { AttendanceStatus } from '@app/shared';

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
