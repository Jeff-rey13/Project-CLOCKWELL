'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ERRORS } from '@app/shared';
import { fmtDays, leaveRange, LeaveStatus } from '@/components/LeaveStatus';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { queryKeys, useCompanyLeave, type LeaveRequestRow } from '@/lib/queries';
import { useSession } from '@/lib/session';

export default function HrLeavePage() {
  const leave = useCompanyLeave();
  const rows = leave.data ?? [];
  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending').slice(0, 30);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-3xl">Leave</h1>
      <Card>
        <CardTitle className="mb-3">Waiting for you ({pending.length})</CardTitle>
        {leave.isLoading ? (
          <ListSkeleton rows={3} />
        ) : leave.isError ? (
          <EmptyState title="Could not load leave requests" body="Check your connection and try again." />
        ) : pending.length === 0 ? (
          <EmptyState title="All caught up" body="New leave requests will show here." />
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((r) => (
              <PendingRow key={r.id} row={r} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-3">Recently decided</CardTitle>
        {decided.length === 0 ? (
          <p className="text-sm text-muted">Nothing decided yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{r.profiles?.full_name ?? 'Employee'}</p>
                  <p className="text-sm text-muted">
                    {r.leave_types?.name}, {leaveRange(r)}, {fmtDays(r.days)}
                  </p>
                </div>
                <LeaveStatus status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function PendingRow({ row }: { row: LeaveRequestRow }) {
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const own = row.user_id === profile?.user_id;

  const decide = async (approve: boolean) => {
    if (!profile) return;
    setBusy(approve ? 'approve' : 'reject');
    const res = await callFunction(client, 'decide-leave', { request_id: row.id, approve, note });
    setBusy(null);
    if (!res.ok) {
      toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.hrLeave(profile.company_id) });
    toast(approve ? 'Leave approved.' : 'Leave rejected.');
  };

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {row.profiles?.full_name ?? 'Employee'}{' '}
            <span className="font-mono text-xs font-normal text-muted">{row.profiles?.employee_code}</span>
          </p>
          <p className="text-sm text-muted">
            {row.leave_types?.name}, {leaveRange(row)}, {fmtDays(row.days)}
          </p>
          {row.reason ? <p className="mt-1 text-sm">{row.reason}</p> : null}
        </div>
        <LeaveStatus status={row.status} />
      </div>
      {own ? (
        <p className="text-sm text-muted">This is your own request. Another HR admin must decide it.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={`note-${row.id}`} className="text-sm font-medium">
              Note to employee (optional)
            </label>
            <input
              id={`note-${row.id}`}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-11 rounded-box border border-line-strong bg-surface px-3.5 text-base outline-none focus:border-fg"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => decide(false)} loading={busy === 'reject'} disabled={busy !== null}>
              Reject
            </Button>
            <Button onClick={() => decide(true)} loading={busy === 'approve'} disabled={busy !== null}>
              Approve
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
