'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { MapPin, Airplane, FirstAidKit } from '@phosphor-icons/react';
import { AttendanceList } from '@/components/AttendanceList';
import { PreviewNote } from '@/components/layout/PreviewNote';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/Chip';
import { demoAttendance, demoShift, demoTiles, demoUser, demoCompany } from '@/lib/demo-data';
import { getDoneShifts, getOpenShift, hhmm, subscribe } from '@/lib/preview-shift';

const noShifts: never[] = [];

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

export default function HomePage() {
  const now = useNow();
  const tz = 'Asia/Singapore';
  const hour = now ? Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now)) : 9;
  const openShift = useSyncExternalStore(subscribe, getOpenShift, () => null);
  const doneShifts = useSyncExternalStore(subscribe, getDoneShifts, () => noShifts);
  const rows = [...doneShifts, ...demoAttendance];

  return (
    <>
      <PreviewNote />
      <header className="mb-5">
        <p className="text-sm text-muted">
          {now
            ? new Intl.DateTimeFormat('en-SG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(now)
            : ' '}
        </p>
        <h1 className="text-2xl">
          {greeting(hour)}, {demoUser.firstName}
        </h1>
        <p className="text-sm text-muted">{demoCompany.name}</p>
      </header>

      <section aria-label="Clock" className="mb-5 rounded-card bg-solid p-5 text-on-solid">
        <p className="text-sm opacity-70">Shift {demoShift.start} to {demoShift.end}</p>
        <p className="my-2 font-mono text-5xl font-semibold tracking-tight" aria-live="off">
          {now
            ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(now)
            : '--:--'}
        </p>
        {openShift ? (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="opacity-70">Clocked in at {hhmm(new Date(openShift.clockInAt))}</span>
            <StatusChip status={openShift.status} />
          </div>
        ) : (
          <p className="mb-4 flex items-center gap-1.5 text-sm opacity-70">
            <MapPin size={16} aria-hidden /> {demoUser.office} office. Location is checked when you clock in.
          </p>
        )}
        <Link
          href="/clock/"
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-on-solid text-base font-semibold text-solid"
        >
          {openShift ? 'Clock out' : 'Clock in'}
        </Link>
      </section>

      <section aria-label="Summary" className="mb-5 grid grid-cols-2 gap-3">
        <Tile label="Days present this month" value={demoTiles.daysPresent} />
        <Tile label="Annual leave left" value={demoTiles.annualLeft} />
        <Tile label="Sick leave left" value={demoTiles.sickLeft} />
        <Tile label="Claims pending" value={demoTiles.claimsPending} />
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/requests/"
          className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-sm font-semibold"
        >
          <Airplane size={18} aria-hidden /> Apply leave
        </Link>
        <Link
          href="/requests/"
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
        <AttendanceList rows={rows.slice(0, 3)} />
      </section>
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3.5">
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}
