'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadSimple } from '@phosphor-icons/react';
import { ERRORS, correctionReasonLabel, type AttendanceFlag, type AttendanceStatus } from '@app/shared';
import { CorrectionForm, type ShiftForFix } from '@/components/CorrectionForm';
import { DecisionStatus } from '@/components/DecisionStatus';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localDate, localTime, useCompanyCorrections, usePeopleNames, type CorrectionRow } from '@/lib/queries';
import { useSession } from '@/lib/session';

const TZ = 'Asia/Singapore';

interface DayRow extends ShiftForFix {
  user_id: string;
  status: AttendanceStatus;
  flags: AttendanceFlag[];
  clock_in_place: 'site' | 'home' | 'outside';
  clock_in_distance_m: number | null;
  is_corrected: boolean;
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function HrAttendancePage() {
  const { client, profile } = useSession();
  const people = usePeopleNames();
  const corrections = useCompanyCorrections();
  const [date, setDate] = useState(() => localDate(new Date(), TZ));
  const [adjusting, setAdjusting] = useState<DayRow | null>(null);

  const log = useQuery({
    queryKey: ['hr-day-log', profile?.company_id ?? '', date],
    enabled: profile?.app_role === 'hr' && /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: async () => {
      const { data, error } = await client
        .from('attendance_effective')
        .select(
          'id, user_id, work_date, clock_in_at, clock_out_at, effective_clock_in_at, effective_clock_out_at, status, flags, clock_in_place, clock_in_distance_m, is_corrected',
        )
        .eq('work_date', date)
        .order('effective_clock_in_at');
      if (error) throw new Error('load failed');
      return (data ?? []) as DayRow[];
    },
  });

  const name = (id: string) => people.data?.get(id)?.full_name ?? 'Employee';
  const pending = (corrections.data ?? []).filter((c) => c.status === 'pending');
  const historyFor = (id: string) => (corrections.data ?? []).filter((c) => c.attendance_id === id);

  const rows = useMemo(() => log.data ?? [], [log.data]);

  const exportCsv = () => {
    const header = ['Date', 'Employee', 'Employee ID', 'Clock in', 'Clock out', 'Status', 'Place', 'Distance (m)', 'Flags', 'Corrected'];
    const lines = rows.map((r) =>
      [
        r.work_date,
        name(r.user_id),
        people.data?.get(r.user_id)?.employee_code ?? '',
        localTime(r.effective_clock_in_at, TZ),
        r.effective_clock_out_at ? localTime(r.effective_clock_out_at, TZ) : '',
        r.status,
        r.clock_in_place,
        r.clock_in_distance_m,
        r.flags.join(' '),
        r.is_corrected ? 'yes' : 'no',
      ]
        .map(csvCell)
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
      <h1 className="text-3xl">Attendance</h1>

      <Card>
        <CardTitle className="mb-3">Time fixes from staff ({pending.length})</CardTitle>
        {corrections.isLoading ? (
          <ListSkeleton rows={2} />
        ) : pending.length === 0 ? (
          <EmptyState title="No time fixes waiting" body="Requests from staff will show here." />
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((c) => (
              <FixRow key={c.id} fix={c} who={name(c.attendance?.user_id ?? c.requested_by)} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="relative w-full min-w-0 overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <CardTitle>Day log</CardTitle>
          <div className="flex items-end gap-2">
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0} className="mb-0">
              <DownloadSimple size={18} aria-hidden /> CSV
            </Button>
          </div>
        </div>
        {log.isLoading ? (
          <ListSkeleton rows={4} />
        ) : log.isError ? (
          <EmptyState title="Could not load the day log" body="Check your connection and try again." />
        ) : rows.length === 0 ? (
          <EmptyState title="No clock-ins on this day" />
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">Employee</th>
                <th className="py-2 pr-3 font-medium">In</th>
                <th className="py-2 pr-3 font-medium">Out</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Place</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 pr-3 font-semibold">{name(r.user_id)}</td>
                  <td className="py-3 pr-3 font-mono">{localTime(r.effective_clock_in_at, TZ)}</td>
                  <td className="py-3 pr-3 font-mono">
                    {r.effective_clock_out_at ? localTime(r.effective_clock_out_at, TZ) : 'Still in'}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-wrap gap-1">
                      <StatusChip status={r.status} />
                      {r.is_corrected ? <Chip tone="outline">Corrected</Chip> : null}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {r.clock_in_place === 'home' ? <Chip tone="outline">Home</Chip> : null}
                      {r.flags.includes('outside_zone') ? (
                        <Chip tone="danger">Check location</Chip>
                      ) : r.clock_in_place === 'site' ? (
                        <span className="text-muted">Site, {r.clock_in_distance_m ?? '-'} m</span>
                      ) : null}
                      {r.flags.includes('gps_weak') ? <Chip tone="outline">Weak GPS</Chip> : null}
                    </div>
                  </td>
                  <td className="py-3 text-right">
                    {r.user_id !== profile?.user_id ? (
                      <Button variant="outline" className="min-h-9 px-4" onClick={() => setAdjusting(r)}>
                        Adjust
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Sheet open={adjusting !== null} title={adjusting ? `Adjust ${name(adjusting.user_id)}` : 'Adjust'} onClose={() => setAdjusting(null)}>
        {adjusting ? (
          <>
            <CorrectionForm shift={adjusting} mode="adjust" timezone={TZ} onDone={() => setAdjusting(null)} />
            <History items={historyFor(adjusting.id)} name={name} />
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

function History({ items, name }: { items: CorrectionRow[]; name: (id: string) => string }) {
  if (items.length === 0) return <p className="text-sm text-muted">No changes to this shift yet.</p>;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">History</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {items.map((c) => (
          <li key={c.id} className="rounded-box bg-soft px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span>
                {c.field === 'clock_in' ? 'Clock-in' : 'Clock-out'} to{' '}
                <span className="font-mono">{localTime(c.corrected_at, TZ)}</span>
              </span>
              <DecisionStatus status={c.status} />
            </div>
            <p className="text-muted">
              {correctionReasonLabel[c.reason_code]} by {name(c.requested_by)}
              {c.note ? `: ${c.note}` : ''}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FixRow({ fix, who }: { fix: CorrectionRow; who: string }) {
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const own = fix.requested_by === profile?.user_id;

  const decide = async (approve: boolean) => {
    setBusy(true);
    const res = await callFunction(client, 'correct-attendance', { correction_id: fix.id, approve });
    setBusy(false);
    if (!res.ok) {
      toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hr-corrections'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-day-log'] }),
    ]);
    toast(approve ? 'Time fix approved.' : 'Time fix rejected.');
  };

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">{who}</p>
        <p className="text-sm text-muted">
          {fix.field === 'clock_in' ? 'Clock-in' : 'Clock-out'} on {fix.attendance?.work_date}:{' '}
          {fix.original_at ? `${localTime(fix.original_at, TZ)} to ` : 'set to '}
          <span className="font-mono text-fg">{localTime(fix.corrected_at, TZ)}</span>, {correctionReasonLabel[fix.reason_code]}
        </p>
        {fix.note ? <p className="text-sm">{fix.note}</p> : null}
      </div>
      {own ? (
        <span className="text-xs text-muted">Your own</span>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => decide(false)} disabled={busy}>
            Reject
          </Button>
          <Button onClick={() => decide(true)} disabled={busy}>
            Approve
          </Button>
        </div>
      )}
    </li>
  );
}
