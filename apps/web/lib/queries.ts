'use client';

import { useQuery } from '@tanstack/react-query';
import type { AttendanceFlag, AttendanceStatus, WorkMode } from '@app/shared';
import { useSession } from './session';

export const queryKeys = {
  workplace: (userId: string) => ['workplace', userId] as const,
  openShift: (userId: string) => ['open-shift', userId] as const,
  attendance: (userId: string) => ['attendance', userId] as const,
  balances: (userId: string, year: number) => ['balances', userId, year] as const,
  claimsPending: (userId: string) => ['claims-pending', userId] as const,
  leaveTypes: (companyId: string) => ['leave-types', companyId] as const,
  holidays: (companyId: string) => ['holidays', companyId] as const,
  myLeave: (userId: string) => ['my-leave', userId] as const,
  myClaims: (userId: string) => ['my-claims', userId] as const,
  hrLeave: (companyId: string) => ['hr-leave', companyId] as const,
};

export interface Office {
  id: string;
  name: string;
  work_mode: WorkMode;
  timezone: string;
  shift_start: string;
  shift_end: string;
  grace_minutes: number;
  home_days: number[];
  require_selfie: boolean;
}
export interface Site {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}
export interface EmployeeRules {
  work_mode_override: WorkMode | null;
  shift_start: string | null;
  shift_end: string | null;
  grace_minutes: number | null;
  home_days: number[] | null;
  home_lat: number | null;
  home_lng: number | null;
  home_radius_m: number;
  home_status: 'none' | 'pending' | 'approved';
}

/** The user's office, its sites and their personal rule overrides. */
export function useWorkplace() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.workplace(profile?.user_id ?? ''),
    enabled: !!profile?.office_id,
    queryFn: async () => {
      const [office, sites, rules] = await Promise.all([
        client
          .from('offices')
          .select('id, name, work_mode, timezone, shift_start, shift_end, grace_minutes, home_days, require_selfie')
          .eq('id', profile!.office_id!)
          .single(),
        client.from('sites').select('id, name, lat, lng, radius_m').eq('office_id', profile!.office_id!),
        client
          .from('employee_rules')
          .select('work_mode_override, shift_start, shift_end, grace_minutes, home_days, home_lat, home_lng, home_radius_m, home_status')
          .eq('user_id', profile!.user_id)
          .maybeSingle(),
      ]);
      if (office.error || sites.error) throw new Error('load failed');
      return {
        office: office.data as Office,
        sites: ((sites.data ?? []) as Site[]).map((s) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) })),
        rules: (rules.data as EmployeeRules | null) ?? null,
      };
    },
  });
}

export interface AttendanceRow {
  id: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  effective_clock_in_at: string;
  effective_clock_out_at: string | null;
  status: AttendanceStatus;
  flags: AttendanceFlag[];
  clock_in_place: 'site' | 'home' | 'outside';
  is_corrected: boolean;
}

const ATTENDANCE_COLUMNS =
  'id, work_date, clock_in_at, clock_out_at, effective_clock_in_at, effective_clock_out_at, status, flags, clock_in_place, is_corrected';

export function useOpenShift() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.openShift(profile?.user_id ?? ''),
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await client
        .from('attendance_effective')
        .select(ATTENDANCE_COLUMNS)
        .eq('user_id', profile!.user_id)
        .is('clock_out_at', null)
        .maybeSingle();
      if (error) throw new Error('load failed');
      return (data as AttendanceRow | null) ?? null;
    },
  });
}

export function useAttendance(limit = 200) {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: [...queryKeys.attendance(profile?.user_id ?? ''), limit],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await client
        .from('attendance_effective')
        .select(ATTENDANCE_COLUMNS)
        .eq('user_id', profile!.user_id)
        .order('clock_in_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error('load failed');
      return (data ?? []) as AttendanceRow[];
    },
  });
}

export interface Balance {
  leave_type_id: string;
  entitled: number;
  used: number;
  leave_types: { code: string; name: string } | null;
}

export function useBalances(year: number) {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.balances(profile?.user_id ?? '', year),
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await client
        .from('leave_balances')
        .select('leave_type_id, entitled, used, leave_types(code, name)')
        .eq('user_id', profile!.user_id)
        .eq('year', year);
      if (error) throw new Error('load failed');
      return ((data ?? []) as unknown as Balance[]).map((b) => ({
        ...b,
        entitled: Number(b.entitled),
        used: Number(b.used),
      }));
    },
  });
}

export function useClaimsPending() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.claimsPending(profile?.user_id ?? ''),
    enabled: !!profile,
    queryFn: async () => {
      const { count, error } = await client
        .from('medical_claims')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile!.user_id)
        .eq('status', 'pending');
      if (error) throw new Error('load failed');
      return count ?? 0;
    },
  });
}

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  requires_attachment: boolean;
}

export function useLeaveTypes() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.leaveTypes(profile?.company_id ?? ''),
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await client
        .from('leave_types')
        .select('id, code, name, requires_attachment')
        .order('name');
      if (error) throw new Error('load failed');
      return (data ?? []) as LeaveType[];
    },
  });
}

export function useHolidays() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.holidays(profile?.company_id ?? ''),
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await client.from('holidays').select('date, name').order('date');
      if (error) throw new Error('load failed');
      return (data ?? []) as Array<{ date: string; name: string }>;
    },
  });
}

export interface LeaveRequestRow {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  half_day_end: boolean;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decision_note: string | null;
  created_at: string;
  leave_types: { name: string } | null;
  profiles?: { full_name: string; employee_code: string } | null;
}

const LEAVE_COLUMNS =
  'id, user_id, start_date, end_date, half_day_end, days, reason, status, decision_note, created_at, leave_types(name)';

export function useMyLeave() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.myLeave(profile?.user_id ?? ''),
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await client
        .from('leave_requests')
        .select(LEAVE_COLUMNS)
        .eq('user_id', profile!.user_id)
        .order('start_date', { ascending: false })
        .limit(100);
      if (error) throw new Error('load failed');
      return ((data ?? []) as unknown as LeaveRequestRow[]).map((r) => ({ ...r, days: Number(r.days) }));
    },
  });
}

/** HR: every leave request in the company, newest first, with the requester's name. */
export function useCompanyLeave() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: queryKeys.hrLeave(profile?.company_id ?? ''),
    enabled: profile?.app_role === 'hr',
    queryFn: async () => {
      const [requests, people] = await Promise.all([
        client.from('leave_requests').select(LEAVE_COLUMNS).order('created_at', { ascending: false }).limit(200),
        client.from('profiles').select('user_id, full_name, employee_code'),
      ]);
      if (requests.error || people.error) throw new Error('load failed');
      const byId = new Map((people.data ?? []).map((p) => [p.user_id as string, p]));
      return ((requests.data ?? []) as unknown as LeaveRequestRow[]).map((r) => ({
        ...r,
        days: Number(r.days),
        profiles: (byId.get(r.user_id) as { full_name: string; employee_code: string } | undefined) ?? null,
      }));
    },
  });
}

/** Today's date (yyyy-mm-dd) and time (HH:MM) in a time zone. */
export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(d);
}
export function localTime(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    typeof iso === 'string' ? new Date(iso) : iso,
  );
}
