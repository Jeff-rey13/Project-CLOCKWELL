'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from '@phosphor-icons/react';
import { ERRORS, type AttendanceFlag, type AttendanceStatus } from '@app/shared';
import { fmtDays, leaveRange } from '@/components/LeaveStatus';
import { ModeSwitch } from '@/components/layout/ModeSwitch';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localTime, money, useCompanyClaims, useCompanyCorrections, useCompanyLeave, usePeopleNames } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface Dashboard {
  date: string;
  headcount: number;
  in_today: number;
  in_now: number;
  in_office: number;
  on_leave: number;
  not_clocked_in: number;
  late: number;
  flagged: number;
}

interface Waiting {
  key: string;
  ownerId: string;
  who: string;
  what: string;
  fn: 'decide-leave' | 'decide-claim' | 'correct-attendance';
  body: (approve: boolean) => Record<string, unknown>;
}

export default function HrDashboardPage() {
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? '';
  const people = usePeopleNames();
  const leave = useCompanyLeave();
  const claims = useCompanyClaims();
  const fixes = useCompanyCorrections();

  const dashboard = useQuery({
    queryKey: ['hr-dashboard', companyId],
    enabled: !!companyId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await client.rpc('hr_dashboard');
      if (error) throw new Error('load failed');
      return data as Dashboard;
    },
  });

  const latest = useQuery({
    queryKey: ['hr-latest', companyId, dashboard.data?.date],
    enabled: !!dashboard.data?.date,
    queryFn: async () => {
      const { data, error } = await client
        .from('attendance')
        .select('id, user_id, clock_in_at, clock_out_at, status, flags, clock_in_place')
        .eq('work_date', dashboard.data!.date)
        .order('clock_in_at', { ascending: false })
        .limit(12);
      if (error) throw new Error('load failed');
      return (data ?? []) as Array<{
        id: string;
        user_id: string;
        clock_in_at: string;
        clock_out_at: string | null;
        status: AttendanceStatus;
        flags: AttendanceFlag[];
        clock_in_place: string;
      }>;
    },
  });

  // Live: any clock-in or clock-out in the company refreshes the figures and the list.
  useEffect(() => {
    if (!companyId) return;
    let channel: ReturnType<typeof client.channel> | null = null;
    let cancelled = false;
    // Realtime checks access rules with the user's token, so set it before joining.
    void client.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session) return;
      await client.realtime.setAuth(data.session.access_token);
      channel = client
        .channel(`attendance-${companyId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
          void queryClient.invalidateQueries({ queryKey: ['hr-dashboard', companyId] });
          void queryClient.invalidateQueries({ queryKey: ['hr-latest', companyId] });
        })
        .subscribe();
    });
    return () => {
      cancelled = true;
      if (channel) void client.removeChannel(channel);
    };
  }, [client, companyId, queryClient]);

  const waiting: Waiting[] = [
    ...(leave.data ?? [])
      .filter((r) => r.status === 'pending')
      .map((r) => ({
        key: `l-${r.id}`,
        ownerId: r.user_id,
        who: r.profiles?.full_name ?? 'Employee',
        what: `${r.leave_types?.name ?? 'Leave'}, ${leaveRange(r)} (${fmtDays(r.days)})`,
        fn: 'decide-leave' as const,
        body: (approve: boolean) => ({ request_id: r.id, approve, note: '' }),
      })),
    ...(claims.data ?? [])
      .filter((c) => c.status === 'pending')
      .map((c) => ({
        key: `c-${c.id}`,
        ownerId: c.user_id,
        who: c.profiles?.full_name ?? 'Employee',
        what: `Medical claim, ${money(c.amount, c.currency)}`,
        fn: 'decide-claim' as const,
        body: (approve: boolean) => ({ claim_id: c.id, approve, note: '' }),
      })),
    ...(fixes.data ?? [])
      .filter((f) => f.status === 'pending')
      .map((f) => ({
        key: `f-${f.id}`,
        ownerId: f.requested_by,
        who: people.data?.get(f.attendance?.user_id ?? f.requested_by)?.full_name ?? 'Employee',
        what: `Time fix, ${f.field === 'clock_in' ? 'clock-in' : 'clock-out'} ${f.attendance?.work_date ?? ''} to ${localTime(f.corrected_at, 'Asia/Singapore')}`,
        fn: 'correct-attendance' as const,
        body: (approve: boolean) => ({ correction_id: f.id, approve }),
      })),
  ];

  const d = dashboard.data;
  const tz = 'Asia/Singapore';

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 hidden justify-end lg:flex">
        <ModeSwitch mode="hr" />
      </div>
      {d ? (
        <h1 className="mb-1 text-3xl">
          {d.in_today} of {d.headcount} in today
        </h1>
      ) : (
        <Skeleton className="mb-2 h-9 w-56" />
      )}
      <p className="mb-6 text-sm text-muted">Live from clock-ins at all offices.</p>

      <section aria-label="Today" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="In office now" value={d?.in_office} />
        <Kpi label="On leave" value={d?.on_leave} />
        <Kpi label="Not clocked in" value={d?.not_clocked_in} />
        <Kpi label="Late" value={d?.late} />
        <Kpi label="Flagged location" value={d?.flagged} danger />
      </section>
      {dashboard.isError ? (
        <p className="mb-6 text-sm text-danger">
          {ERRORS.SERVER_ERROR.message} {ERRORS.SERVER_ERROR.nextStep}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Waiting for you</CardTitle>
          {leave.isLoading || claims.isLoading ? (
            <ListSkeleton rows={3} />
          ) : waiting.length === 0 ? (
            <EmptyState title="All caught up" body="New leave, claims and time fixes will show here." />
          ) : (
            <ul className="divide-y divide-line">
              {waiting.slice(0, 8).map((w) => (
                <WaitingRow key={w.key} item={w} />
              ))}
            </ul>
          )}
          {waiting.length > 0 ? (
            <p className="mt-3 flex gap-4 text-sm">
              <Link href="/hr/leave/" className="underline underline-offset-4">
                All leave
              </Link>
              <Link href="/hr/claims/" className="underline underline-offset-4">
                All claims
              </Link>
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle className="mb-3">Latest clock-ins</CardTitle>
          {latest.isLoading || dashboard.isLoading ? (
            <ListSkeleton rows={4} />
          ) : (latest.data ?? []).length === 0 ? (
            <EmptyState title="No clock-ins yet today" body="They will appear here as staff clock in." />
          ) : (
            <ul className="divide-y divide-line">
              {(latest.data ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold">{people.data?.get(c.user_id)?.full_name ?? 'Employee'}</p>
                    <p className="font-mono text-xs text-muted">
                      {localTime(c.clock_in_at, tz)}
                      {c.clock_out_at ? ` to ${localTime(c.clock_out_at, tz)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <StatusChip status={c.status} />
                    {c.clock_in_place === 'home' ? <Chip tone="outline">Home</Chip> : null}
                    {c.flags.includes('outside_zone') ? <Chip tone="danger">Check location</Chip> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function WaitingRow({ item }: { item: Waiting }) {
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const own = item.ownerId === profile?.user_id;

  const decide = async (approve: boolean) => {
    setBusy(true);
    const res = await callFunction(client, item.fn, item.body(approve));
    setBusy(false);
    if (!res.ok) {
      toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hr-leave'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-claims'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-corrections'] }),
    ]);
    toast(approve ? 'Approved.' : 'Rejected.');
  };

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{item.who}</p>
        <p className="text-sm text-muted">{item.what}</p>
      </div>
      {own ? (
        <span className="text-xs text-muted">Your own</span>
      ) : (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            aria-label={`Reject: ${item.who}, ${item.what}`}
            className="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-soft disabled:opacity-50"
          >
            <X size={18} aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            aria-label={`Approve: ${item.who}, ${item.what}`}
            className="flex size-11 items-center justify-center rounded-full bg-solid text-on-solid hover:opacity-90 disabled:opacity-50"
          >
            <Check size={18} aria-hidden />
          </button>
        </div>
      )}
    </li>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number | undefined; danger?: boolean }) {
  return (
    <Card className="p-3.5">
      {value === undefined ? (
        <Skeleton className="mb-1 h-8 w-10" />
      ) : (
        <p className={`text-2xl font-bold tracking-tight ${danger && value > 0 ? 'text-danger' : ''}`}>{value}</p>
      )}
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}
