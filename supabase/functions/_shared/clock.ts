// Clock-in / clock-out planning (PRD 7.1). Pure functions: no database access, so they are unit tested.
import {
  evaluateClockIn,
  type AttendanceFlag,
  type ClockEvaluation,
  type EffectiveRules,
  type ErrorCode,
  type WorkMode,
  type Zone,
} from './app.ts';

export interface OfficeRow {
  id: string;
  work_mode: WorkMode;
  timezone: string;
  shift_start: string;
  grace_minutes: number;
  home_days: number[];
  require_selfie: boolean;
  flag_outside: boolean;
}

export interface RulesRow {
  work_mode_override: WorkMode | null;
  shift_start: string | null;
  grace_minutes: number | null;
  home_days: number[] | null;
  home_lat: number | string | null;
  home_lng: number | string | null;
  home_radius_m: number;
  home_status: 'none' | 'pending' | 'approved';
}

export interface SiteRow {
  id: string;
  lat: number | string;
  lng: number | string;
  radius_m: number;
}

export interface ClockContext {
  companyStatus: string;
  attendanceModule: boolean;
  profileStatus: string;
  office: OfficeRow | null;
  rules: RulesRow | null;
  sites: SiteRow[];
}

/** Employee override if set, else the office value. */
export function effectiveRules(office: OfficeRow, rules: RulesRow | null): EffectiveRules {
  return {
    workMode: rules?.work_mode_override ?? office.work_mode,
    timezone: office.timezone,
    shiftStart: rules?.shift_start ?? office.shift_start,
    graceMinutes: rules?.grace_minutes ?? office.grace_minutes,
    homeDays: rules?.home_days ?? office.home_days,
  };
}

export function homeZone(rules: RulesRow | null): Zone | null {
  if (!rules || rules.home_status !== 'approved' || rules.home_lat == null || rules.home_lng == null) return null;
  return { id: 'home', kind: 'home', lat: Number(rules.home_lat), lng: Number(rules.home_lng), radiusM: rules.home_radius_m };
}

export function siteZones(sites: SiteRow[]): Zone[] {
  return sites.map((s) => ({ id: s.id, kind: 'site', lat: Number(s.lat), lng: Number(s.lng), radiusM: s.radius_m }));
}

/** Checks that stop a clock event before any location work. Returns an error code or null. */
export function gate(ctx: ClockContext, selfiePath: string | null): ErrorCode | null {
  if (ctx.companyStatus === 'suspended' || ctx.companyStatus === 'pending_deletion') return 'COMPANY_SUSPENDED';
  if (!ctx.attendanceModule) return 'FEATURE_OFF';
  if (ctx.profileStatus !== 'active') return 'NOT_ACTIVE';
  if (!ctx.office) return 'FORBIDDEN';
  if (ctx.office.require_selfie && !selfiePath) return 'SELFIE_REQUIRED';
  return null;
}

/** A selfie path must sit in the caller's own folder: {company_id}/{user_id}/... */
export function selfiePathAllowed(path: string | null, companyId: string, userId: string): boolean {
  if (path === null) return true;
  return path.startsWith(`${companyId}/${userId}/`) && !path.includes('..') && /\.(webp|jpe?g)$/.test(path);
}

export interface PlanInput {
  now: Date;
  deviceTime: Date | null;
  lat: number;
  lng: number;
  accuracyM: number;
  placeChoice: 'office' | 'home';
}

/** Where the user is and what to flag. Location never blocks (PRD 7.1 step 6). */
export function planClock(ctx: ClockContext & { office: OfficeRow }, input: PlanInput): ClockEvaluation {
  const rules = effectiveRules(ctx.office, ctx.rules);
  const home = input.placeChoice === 'home' ? homeZone(ctx.rules) : null;
  const evaluation = evaluateClockIn(
    {
      serverTime: input.now,
      deviceTime: input.deviceTime,
      position: { lat: input.lat, lng: input.lng },
      accuracyM: input.accuracyM,
      sites: siteZones(ctx.sites),
      home,
    },
    rules,
  );
  // The office can turn off location flags (offices.flag_outside).
  const flags: AttendanceFlag[] = ctx.office.flag_outside
    ? evaluation.flags
    : evaluation.flags.filter((f) => f !== 'outside_zone');
  return { ...evaluation, flags };
}

export function mergeFlags(a: readonly AttendanceFlag[], b: readonly AttendanceFlag[]): AttendanceFlag[] {
  return [...new Set([...a, ...b])];
}
