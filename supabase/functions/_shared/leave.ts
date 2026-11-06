// Leave request checks (PRD 2.1, 4.4). Pure functions so they are unit tested.
import { countLeaveDays, rangesOverlap, type ErrorCode } from './app.ts';

export interface ExistingRequest {
  start_date: string;
  end_date: string;
  status: string;
  leave_type_id: string;
  days: number | string;
}

export interface LeaveCheckInput {
  startDate: string;
  endDate: string;
  halfDayEnd: boolean;
  leaveTypeId: string;
  holidays: string[];
  existing: ExistingRequest[];
  balance: { entitled: number | string; used: number | string } | null;
  requiresAttachment: boolean;
  hasAttachment: boolean;
}

export type LeaveCheck = { ok: true; days: number; balanceAfter: number } | { ok: false; code: ErrorCode };

export function checkLeaveRequest(input: LeaveCheckInput): LeaveCheck {
  const days = countLeaveDays(input.startDate, input.endDate, input.holidays, input.halfDayEnd);
  if (days <= 0) return { ok: false, code: 'VALIDATION_FAILED' };
  if (input.requiresAttachment && !input.hasAttachment) return { ok: false, code: 'VALIDATION_FAILED' };

  const live = input.existing.filter((r) => r.status === 'pending' || r.status === 'approved');
  if (live.some((r) => rangesOverlap(input.startDate, input.endDate, r.start_date, r.end_date))) {
    return { ok: false, code: 'LEAVE_OVERLAP' };
  }

  if (!input.balance) return { ok: false, code: 'LEAVE_BALANCE_LOW' };
  // Pending requests of the same type are held against the balance until decided.
  const held = live
    .filter((r) => r.status === 'pending' && r.leave_type_id === input.leaveTypeId)
    .reduce((sum, r) => sum + Number(r.days), 0);
  const available = Number(input.balance.entitled) - Number(input.balance.used) - held;
  if (days > available) return { ok: false, code: 'LEAVE_BALANCE_LOW' };
  return { ok: true, days, balanceAfter: available - days };
}

/** Attachments live in the receipts bucket under the caller's own folder. */
export function attachmentPathAllowed(path: string | null, companyId: string, userId: string): boolean {
  if (path === null) return true;
  return (
    path.startsWith(`${companyId}/${userId}/leave/`) && !path.includes('..') && /\.(jpe?g|png|pdf)$/i.test(path)
  );
}
