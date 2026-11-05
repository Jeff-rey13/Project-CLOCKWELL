/**
 * Preview build only: keeps the open shift and today's finished shifts in sessionStorage
 * so clock in and clock out can be shown before the `clock-in` / `clock-out` functions
 * are wired (task 1.7). Real times come from the server once wired.
 */
import type { AttendanceFlag, AttendanceStatus } from '@app/shared';
import type { DemoAttendanceRow } from './demo-data';

const OPEN_KEY = 'preview-open-shift';
const DONE_KEY = 'preview-done-shifts';
const EVENT = 'preview-shift-change';

export interface OpenShift {
  clockInAt: string; // ISO
  status: AttendanceStatus;
  flags: AttendanceFlag[];
}

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the preview still works for this page view.
  }
  cache.clear();
  window.dispatchEvent(new Event(EVENT));
}

// useSyncExternalStore needs stable snapshots, so parsed values are cached per raw string.
const cache = new Map<string, { raw: string | null; value: unknown }>();
function snapshot<T>(key: string): T | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(key);
  } catch {
    raw = null;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T | null;
  const value = raw ? (JSON.parse(raw) as T) : null;
  cache.set(key, { raw, value });
  return value;
}

export function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export const getOpenShift = () => snapshot<OpenShift>(OPEN_KEY);
export const getDoneShifts = () => snapshot<DemoAttendanceRow[]>(DONE_KEY) ?? EMPTY;
const EMPTY: DemoAttendanceRow[] = [];

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Singapore',
  }).format(d);

const sgDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(d);

export function startShift(shift: OpenShift): void {
  write(OPEN_KEY, shift);
}

export function endShift(now: Date): void {
  const open = read<OpenShift>(OPEN_KEY);
  if (!open) return;
  const start = new Date(open.clockInAt);
  const done = read<DemoAttendanceRow[]>(DONE_KEY) ?? [];
  done.unshift({
    date: sgDate(start),
    clockIn: hhmm(start),
    clockOut: hhmm(now),
    status: open.status,
    flags: open.flags,
    corrected: false,
  });
  write(DONE_KEY, done);
  write(OPEN_KEY, null);
}

export { hhmm };
