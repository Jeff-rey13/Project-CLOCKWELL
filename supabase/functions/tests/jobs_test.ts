import { assertEquals } from 'jsr:@std/assert@1';
import { absentees, isWorkingDay, newYearEntitlement, reminderDue, retentionCutoff, yesterdayIn } from '../_shared/jobs.ts';

// 18:00 shift end in Singapore = 10:00Z.
const base = { timezone: 'Asia/Singapore', shiftEnd: '18:00:00', workDate: '2026-11-11', alreadyReminded: false, reminderOn: true };

Deno.test('reminder: not before 30 minutes after shift end', () => {
  assertEquals(reminderDue({ ...base, now: new Date('2026-11-11T10:29:00Z') }), false);
  assertEquals(reminderDue({ ...base, now: new Date('2026-11-11T10:30:00Z') }), true);
});

Deno.test('reminder: once only, and only when the office wants it', () => {
  assertEquals(reminderDue({ ...base, now: new Date('2026-11-11T12:00:00Z'), alreadyReminded: true }), false);
  assertEquals(reminderDue({ ...base, now: new Date('2026-11-11T12:00:00Z'), reminderOn: false }), false);
});

Deno.test('reminder: a shift left open from a previous day is due', () => {
  assertEquals(reminderDue({ ...base, now: new Date('2026-11-12T02:00:00Z') }), true);
});

Deno.test('yesterday in the company time zone', () => {
  // 00:30 on 12 Nov in Singapore is still 11 Nov in UTC.
  assertEquals(yesterdayIn(new Date('2026-11-11T16:30:00Z'), 'Asia/Singapore'), '2026-11-11');
});

Deno.test('working days skip weekends and holidays', () => {
  assertEquals(isWorkingDay('2026-11-11', new Set()), true); // Wednesday
  assertEquals(isWorkingDay('2026-11-14', new Set()), false); // Saturday
  assertEquals(isWorkingDay('2026-11-11', new Set(['2026-11-11'])), false);
});

Deno.test('absentees: no clock-in, not on leave, already started', () => {
  const staff = [
    { user_id: 'a', start_date: '2025-01-01' },
    { user_id: 'b', start_date: '2025-01-01' },
    { user_id: 'c', start_date: '2025-01-01' },
    { user_id: 'd', start_date: '2026-12-01' },
  ];
  assertEquals(absentees({ date: '2026-11-11', staff, clockedIn: new Set(['a']), onLeave: new Set(['b']) }), ['c']);
});

Deno.test('retention cut-off', () => {
  assertEquals(retentionCutoff(new Date('2026-11-11T00:00:00Z'), 90), '2026-08-13T00:00:00.000Z');
});

Deno.test('new-year entitlement keeps annual, resets others, no carry-over', () => {
  assertEquals(newYearEntitlement('annual', 14, 18), 18);
  assertEquals(newYearEntitlement('annual', 14, null), 14);
  assertEquals(newYearEntitlement('sick', 14, 20), 14);
});
