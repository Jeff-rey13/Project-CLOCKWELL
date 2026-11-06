import { resolvePlace, type LatLng, type PlaceResult, type Zone } from './geo.ts';
import { localParts, timeToSeconds } from './time.ts';

export type WorkMode = 'onsite' | 'hybrid' | 'remote' | 'field';
export type AttendanceStatus = 'on_time' | 'grace' | 'late';
export type AttendanceFlag = 'outside_zone' | 'gps_weak' | 'sent_late' | 'not_home_day';

export const GPS_WEAK_THRESHOLD_M = 100;
export const SENT_LATE_THRESHOLD_MS = 10 * 60 * 1000;

export interface EffectiveRules {
  workMode: WorkMode;
  timezone: string;
  shiftStart: string; // "HH:MM"
  graceMinutes: number;
  homeDays: readonly number[]; // 1 = Mon .. 7 = Sun
}

export interface ClockInput {
  serverTime: Date;
  deviceTime: Date | null;
  position: LatLng;
  accuracyM: number;
  sites: readonly Zone[];
  /** Approved home location, if any. */
  home: Zone | null;
}

export interface ClockEvaluation extends PlaceResult {
  workDate: string;
  status: AttendanceStatus;
  flags: AttendanceFlag[];
}

/** Status from server time in the office time zone. Exactly at the end of grace counts as grace. */
export function clockInStatus(
  serverTime: Date,
  rules: Pick<EffectiveRules, 'timezone' | 'shiftStart' | 'graceMinutes'>,
): AttendanceStatus {
  const { secondsOfDay } = localParts(serverTime, rules.timezone);
  const lateBy = secondsOfDay - timeToSeconds(rules.shiftStart);
  if (lateBy <= 0) return 'on_time';
  if (lateBy <= rules.graceMinutes * 60) return 'grace';
  return 'late';
}

/** Home counts as a valid place when the mode is remote, or hybrid on a home day. */
export function homeAllowed(rules: EffectiveRules, isoWeekday: number): boolean {
  if (rules.workMode === 'remote') return true;
  return rules.workMode === 'hybrid' && rules.homeDays.includes(isoWeekday);
}

/** Applies PRD section 7.1, steps 3 to 5. Location never blocks; it only flags. */
export function evaluateClockIn(input: ClockInput, rules: EffectiveRules): ClockEvaluation {
  const local = localParts(input.serverTime, rules.timezone);
  const zones: Zone[] = [...input.sites];
  if (input.home && homeAllowed(rules, local.isoWeekday)) zones.push(input.home);

  const place = resolvePlace(input.position, zones);
  const flags: AttendanceFlag[] = [];
  if (place.place === 'outside' && rules.workMode !== 'field') flags.push('outside_zone');
  if (input.accuracyM > GPS_WEAK_THRESHOLD_M) flags.push('gps_weak');
  if (
    input.deviceTime &&
    input.serverTime.getTime() - input.deviceTime.getTime() > SENT_LATE_THRESHOLD_MS
  ) {
    flags.push('sent_late');
  }
  if (place.place === 'home' && !rules.homeDays.includes(local.isoWeekday)) {
    flags.push('not_home_day');
  }

  return {
    ...place,
    workDate: local.date,
    status: clockInStatus(input.serverTime, rules),
    flags,
  };
}
