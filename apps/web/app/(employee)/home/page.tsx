'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Airplane, FirstAidKit, MapPin } from '@phosphor-icons/react';
import { AttendanceList } from '@/components/AttendanceList';
import { ModeSwitch } from '@/components/layout/ModeSwitch';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  localDate,
  localTime,
  useAttendance,
  useBalances,
  useClaimsPending,
  useOpenShift,
  useWorkplace,
} from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useQueuedClocks } from '@/lib/use-queued-clocks';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  return now;
}

const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function HomePage() {
  const now = useNow();
  const { profile, companyName } = useSession();
  const workplace = useWorkplace();
  const openShift = useOpenShift();
  const queued = useQueuedClocks();
  const lastQueued = queued.length ? queued[queued.length - 1] : null;
  const attendance = useAttendance(60);
  const year = new Date().getFullYear();
  const balances = useBalances(year);
  const claimsPending = useClaimsPending();

  const tz = workplace.data?.office.timezone ?? 'Asia/Singapore';
  const hour = now
    ? Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now))
    : 9;
  const month = now ? localDate(now, tz).slice(0, 7) : '';
  const daysPresent = new Set((attendance.data ?? []).filter((r) => r.work_date.startsWith(month)).map((r) => r.work_date)).size;
  const left = (code: string) => {
    const b = balances.data?.find((x) => x.leave_types?.code === code);
    return b ? fmtDays(b.entitled - b.used) : '-';
  };
  const office = workplace.data?.office;
  const firstName = profile?.full_name.split(' ')[0] ?? '';

  return (
    <>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">
            {now
              ? new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(now)
              : ' '}
          </p>
          <h1 className="text-2xl">
            {greeting(hour)}, {firstName}
          </h1>
          <p className="text-sm text-muted">{companyName}</p>
        </div>
        {profile?.app_role === 'hr' ? <ModeSwitch mode="me" /> : null}
      </header>

      <section aria-label="Clock" className="mb-5 rounded-card bg-solid p-5 text-on-solid">
        <p className="text-sm opacity-70">
          {office ? `Shift ${office.shift_start.slice(0, 5)} to ${office.shift_end.slice(0, 5)}` : ' '}
        </p>
        <p className="my-2 font-mono text-5xl font-semibold tracking-tight" aria-live="off">
          {now ? localTime(now, tz) : '--:--'}
        </p>
        {lastQueued ? (
          <p className="mb-4 text-sm" role="status">
            <span className="opacity-70">
              {lastQueued.kind === 'clock-in' ? 'Clock-in' : 'Clock-out'} saved at {localTime(lastQueued.createdAt, tz)}, waiting to
              send.
            </span>
          </p>
        ) : openShift.data ? (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="opacity-70">Clocked in at {localTime(openShift.data.clock_in_at, tz)}</span>
            <StatusChip status={openShift.data.status} />
          </div>
        ) : (
          <p className="mb-4 flex items-center gap-1.5 text-sm opacity-70">
            <MapPin size={16} aria-hidden /> {office ? `${office.name} office. ` : ''}Location is checked when you clock in.
          </p>
        )}
        <Link
          href="/clock/"
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-on-solid text-base font-semibold text-solid"
        >
          {lastQueued
            ? lastQueued.kind === 'clock-in'
              ? 'Clock out'
              : 'Clock in'
            : openShift.isLoading
              ? 'Loading'
              : openShift.data
                ? 'Clock out'
                : 'Clock in'}
        </Link>
      </section>

      <section aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3">
        <Tile label="Days present this month" value={attendance.isLoading ? null : String(daysPresent)} />
        <Tile label="Annual leave left" value={balances.isLoading ? null : left('annual')} />
        <Tile label="Sick leave left" value={balances.isLoading ? null : left('sick')} />
        <Tile label="Claims pending" value={claimsPending.isLoading ? null : String(claimsPending.data ?? 0)} />
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/leave/new/"
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-sm font-semibold"
        >
          <Airplane size={18} aria-hidden /> Apply leave
        </Link>
        <Link
          href="/claims/new/"
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-sm font-semibold"
        >
          <FirstAidKit size={18} aria-hidden /> Medical claim
        </Link>
      </div>

      <section aria-labelledby="recent">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="recent" className="text-lg">
            Recent attendance
          </h2>
          <Link href="/attendance/" className="text-sm font-medium underline underline-offset-4">
            See all
          </Link>
        </div>
        <AttendanceList
          rows={attendance.data?.slice(0, 3)}
          timezone={tz}
          loading={attendance.isLoading}
          failed={attendance.isError}
        />
      </section>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string | null }) {
  return (
    <Card className="p-3.5">
      {value === null ? <Skeleton className="mb-1 h-8 w-12" /> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}
