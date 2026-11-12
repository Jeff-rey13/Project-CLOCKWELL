// Scheduled job rules (PRD 3.4). Pure functions, unit tested; the job functions do the database work.
import { localParts, timeToSeconds } from './app.ts';

/** Only pg_cron (through private.call_job) knows the shared job secret. */
export function cronAllowed(req: Request): boolean {
  const expected = Deno.env.get('CRON_SECRET');
  const got = req.headers.get('x-cron-secret');
  if (!expected || !got || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const REMINDER_AFTER_MINUTES = 30;

/** An open shift is due a clock-out reminder 30 minutes after the shift end, once. */
export function reminderDue(input: {
  now: Date;
  timezone: string;
  shiftEnd: string; // HH:MM[:SS]
  workDate: string; // yyyy-mm-dd in the office time zone
  alreadyReminded: boolean;
  reminderOn: boolean;
}): boolean {
  if (input.alreadyReminded || !input.reminderOn) return false;
  const local = localParts(input.now, input.timezone);
  if (local.date > input.workDate) return true; // the shift's day has passed
  if (local.date < input.workDate) return false;
  return local.secondsOfDay >= timeToSeconds(input.shiftEnd) + REMINDER_AFTER_MINUTES * 60;
}

/** Yesterday's date (yyyy-mm-dd) in a time zone. mark-absent checks the day that has fully ended. */
export function yesterdayIn(now: Date, timezone: string): string {
  const today = localParts(now, timezone).date;
  const t = Date.parse(`${today}T00:00:00Z`) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Monday to Friday, and not a company holiday. */
export function isWorkingDay(date: string, holidays: ReadonlySet<string>): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !holidays.has(date);
}

/** Who was absent on a day: active staff who started by then, with no clock-in and no approved leave. */
export function absentees(input: {
  date: string;
  staff: ReadonlyArray<{ user_id: string; start_date: string | null }>;
  clockedIn: ReadonlySet<string>;
  onLeave: ReadonlySet<string>;
}): string[] {
  return input.staff
    .filter((s) => !s.start_date || s.start_date <= input.date)
    .filter((s) => !input.clockedIn.has(s.user_id) && !input.onLeave.has(s.user_id))
    .map((s) => s.user_id);
}

/** Cut-off instant for retention: anything older than `days` days before now. */
export function retentionCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * New-year entitlement for a leave type. Annual leave keeps the person's previous entitlement
 * (HR may have given more than the default); other types reset to the company default. No carry-over.
 */
export function newYearEntitlement(code: string, defaultDays: number, previousEntitled: number | null): number {
  if (code === 'annual' && previousEntitled !== null) return previousEntitled;
  return defaultDays;
}
