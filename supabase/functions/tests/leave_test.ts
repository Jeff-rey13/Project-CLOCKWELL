import { assertEquals } from 'jsr:@std/assert@1';
import { attachmentPathAllowed, checkLeaveRequest, type LeaveCheckInput } from '../_shared/leave.ts';

const base: LeaveCheckInput = {
  startDate: '2026-11-02', // Monday
  endDate: '2026-11-06', // Friday
  halfDayEnd: false,
  leaveTypeId: 'annual',
  holidays: [],
  existing: [],
  balance: { entitled: 14, used: 2.5 },
  requiresAttachment: false,
  hasAttachment: false,
};

Deno.test('counts working days and balance after', () => {
  assertEquals(checkLeaveRequest(base), { ok: true, days: 5, balanceAfter: 6.5 });
});

Deno.test('skips company holidays and half day on the last day', () => {
  const r = checkLeaveRequest({ ...base, holidays: ['2026-11-04'], halfDayEnd: true });
  assertEquals(r, { ok: true, days: 3.5, balanceAfter: 8 });
});

Deno.test('weekend-only range is not valid', () => {
  const r = checkLeaveRequest({ ...base, startDate: '2026-11-07', endDate: '2026-11-08' });
  assertEquals(r, { ok: false, code: 'VALIDATION_FAILED' });
});

Deno.test('overlap with a pending or approved request', () => {
  const existing = [{ start_date: '2026-11-06', end_date: '2026-11-09', status: 'pending', leave_type_id: 'sick', days: 2 }];
  assertEquals(checkLeaveRequest({ ...base, existing }), { ok: false, code: 'LEAVE_OVERLAP' });
  const cancelled = [{ ...existing[0]!, status: 'cancelled' }];
  assertEquals(checkLeaveRequest({ ...base, existing: cancelled }).ok, true);
});

Deno.test('pending requests of the same type hold the balance', () => {
  const existing = [{ start_date: '2026-12-01', end_date: '2026-12-07', status: 'pending', leave_type_id: 'annual', days: 7 }];
  assertEquals(checkLeaveRequest({ ...base, existing }), { ok: false, code: 'LEAVE_BALANCE_LOW' });
});

Deno.test('no balance row means no balance', () => {
  assertEquals(checkLeaveRequest({ ...base, balance: null }), { ok: false, code: 'LEAVE_BALANCE_LOW' });
});

Deno.test('attachment required for some types', () => {
  assertEquals(checkLeaveRequest({ ...base, requiresAttachment: true }).ok, false);
  assertEquals(checkLeaveRequest({ ...base, requiresAttachment: true, hasAttachment: true }).ok, true);
});

Deno.test('attachment path must be in the caller leave folder', () => {
  assertEquals(attachmentPathAllowed('c/u/leave/x.pdf', 'c', 'u'), true);
  assertEquals(attachmentPathAllowed('c/other/leave/x.pdf', 'c', 'u'), false);
  assertEquals(attachmentPathAllowed('c/u/leave/x.exe', 'c', 'u'), false);
});
