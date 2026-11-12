'use client';

import { useQuery } from '@tanstack/react-query';
import type { AttendanceStatus } from '@app/shared';
import { localDate } from './queries';
import { useSession } from './session';

export interface Employee {
  user_id: string;
  full_name: string;
  employee_code: string;
  username: string;
  work_email: string;
  department: string | null;
  office_id: string | null;
  start_date: string | null;
  app_role: 'employee' | 'hr';
  status: 'invited' | 'active' | 'offboarded';
  today: { status: AttendanceStatus; open: boolean; flagged: boolean } | null;
  onLeave: boolean;
  annualLeft: number | null;
}

/** Everyone in the company with today's status and annual leave left. HR only. */
export function useEmployees() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: ['hr-employees', profile?.company_id ?? ''],
    enabled: profile?.app_role === 'hr',
    queryFn: async () => {
      const today = localDate(new Date(), 'Asia/Singapore');
      const year = Number(today.slice(0, 4));
      const [people, shifts, balances, leave, offices] = await Promise.all([
        client
          .from('profiles')
          .select('user_id, full_name, employee_code, username, work_email, department, office_id, start_date, app_role, status')
          .order('full_name'),
        client.from('attendance').select('user_id, status, clock_out_at, flags').eq('work_date', today),
        client.from('leave_balances').select('user_id, entitled, used, leave_types(code)').eq('year', year),
        client
          .from('leave_requests')
          .select('user_id')
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today),
        client.from('offices').select('id, name').order('name'),
      ]);
      if (people.error || shifts.error || balances.error || leave.error || offices.error) throw new Error('load failed');
      const shiftBy = new Map<string, Employee['today']>();
      for (const s of shifts.data ?? []) {
        shiftBy.set(s.user_id as string, {
          status: s.status as AttendanceStatus,
          open: s.clock_out_at === null,
          flagged: ((s.flags as string[]) ?? []).includes('outside_zone'),
        });
      }
      const annualBy = new Map<string, number>();
      for (const b of (balances.data ?? []) as unknown as Array<{
        user_id: string;
        entitled: number;
        used: number;
        leave_types: { code: string } | null;
      }>) {
        if (b.leave_types?.code === 'annual') annualBy.set(b.user_id, Number(b.entitled) - Number(b.used));
      }
      const leaveSet = new Set((leave.data ?? []).map((l) => l.user_id as string));
      return {
        offices: (offices.data ?? []) as Array<{ id: string; name: string }>,
        employees: ((people.data ?? []) as Omit<Employee, 'today' | 'onLeave' | 'annualLeft'>[]).map((p) => ({
          ...p,
          today: shiftBy.get(p.user_id) ?? null,
          onLeave: leaveSet.has(p.user_id),
          annualLeft: annualBy.get(p.user_id) ?? null,
        })),
      };
    },
  });
}
