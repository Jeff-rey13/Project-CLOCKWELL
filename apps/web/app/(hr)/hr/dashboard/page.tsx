'use client';

import { useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { PreviewNote } from '@/components/layout/PreviewNote';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { demoHr } from '@/lib/demo-data';

export default function HrDashboardPage() {
  const toast = useToast();
  const [waiting, setWaiting] = useState(demoHr.waiting);
  const k = demoHr.kpis;

  const decide = (id: string, approve: boolean) => {
    setWaiting((xs) => xs.filter((x) => x.id !== id));
    toast(approve ? 'Approved' : 'Rejected');
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PreviewNote />
      <h1 className="mb-1 text-3xl">
        {demoHr.inToday} of {demoHr.headcount} in today
      </h1>
      <p className="mb-6 text-sm text-muted">Live from clock-ins at all offices.</p>

      <section aria-label="Today" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="In office" value={k.inOffice} />
        <Kpi label="On leave" value={k.onLeave} />
        <Kpi label="Not clocked in" value={k.notClockedIn} />
        <Kpi label="Late" value={k.late} />
        <Kpi label="Flagged location" value={k.flagged} danger />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">Waiting for you</CardTitle>
          {waiting.length === 0 ? (
            <EmptyState title="All caught up" body="New leave, claims and time fixes will show here." />
          ) : (
            <ul className="divide-y divide-line">
              {waiting.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-semibold">{w.who}</p>
                    <p className="text-sm text-muted">{w.what}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => decide(w.id, false)}
                      aria-label={`Reject request from ${w.who}`}
                      className="flex size-11 items-center justify-center rounded-full border border-line-strong hover:bg-soft"
                    >
                      <X size={18} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(w.id, true)}
                      aria-label={`Approve request from ${w.who}`}
                      className="flex size-11 items-center justify-center rounded-full bg-solid text-on-solid hover:opacity-90"
                    >
                      <Check size={18} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle className="mb-3">Latest clock-ins</CardTitle>
          <ul className="divide-y divide-line">
            {demoHr.latest.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{c.who}</p>
                  <p className="font-mono text-xs text-muted">{c.time}</p>
                </div>
                <div className="flex gap-1.5">
                  <StatusChip status={c.status} />
                  {c.flagged ? <Chip tone="danger">Check location</Chip> : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <Card className="p-3.5">
      <p className={`text-2xl font-bold tracking-tight ${danger && value > 0 ? 'text-danger' : ''}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}
