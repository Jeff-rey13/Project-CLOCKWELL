'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Tray } from '@phosphor-icons/react';
import { ERRORS } from '@app/shared';
import { fmtDays, leaveRange, LeaveStatus } from '@/components/LeaveStatus';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localDate, money, queryKeys, useMyClaims, useMyLeave } from '@/lib/queries';
import { DecisionStatus } from '@/components/DecisionStatus';
import { useSession } from '@/lib/session';

export default function RequestsPage() {
  const leave = useMyLeave();
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = localDate(new Date(), 'Asia/Singapore');

  const cancel = async (id: string) => {
    if (!profile) return;
    setBusyId(id);
    const res = await callFunction(client, 'cancel-leave', { request_id: id });
    setBusyId(null);
    if (!res.ok) {
      toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.myLeave(profile.user_id) }),
      queryClient.invalidateQueries({ queryKey: ['balances', profile.user_id] }),
    ]);
    toast('Leave cancelled.');
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl">Requests</h1>
        <Link
          href="/leave/new/"
          className="flex min-h-11 items-center rounded-full bg-solid px-4 text-sm font-semibold text-on-solid"
        >
          Apply leave
        </Link>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-muted">Leave</h2>
      {leave.isLoading ? (
        <ListSkeleton rows={3} />
      ) : leave.isError ? (
        <EmptyState title="Could not load your requests" body="Check your connection and try again." />
      ) : (leave.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Tray size={32} aria-hidden />}
          title="No leave requests yet"
          body="Requests you send will show here with their status."
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {(leave.data ?? []).map((r) => {
            const canCancel = r.status === 'pending' || (r.status === 'approved' && r.start_date > today);
            return (
              <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{r.leave_types?.name ?? 'Leave'}</p>
                    <p className="text-sm text-muted">
                      {leaveRange(r)}, {fmtDays(r.days)}
                      {r.half_day_end ? ' (half day at the end)' : ''}
                    </p>
                  </div>
                  <LeaveStatus status={r.status} />
                </div>
                {r.decision_note ? <p className="text-sm">Note from HR: {r.decision_note}</p> : null}
                {canCancel ? (
                  <Button
                    variant="outline"
                    className="self-start"
                    onClick={() => cancel(r.id)}
                    loading={busyId === r.id}
                  >
                    Cancel request
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted">Medical claims</h2>
        <Link href="/claims/new/" className="text-sm font-medium underline underline-offset-4">
          New claim
        </Link>
      </div>
      <ClaimsList />
    </>
  );
}

const claimDate = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function ClaimsList() {
  const claims = useMyClaims();
  if (claims.isLoading) return <ListSkeleton rows={2} />;
  if (claims.isError) return <EmptyState title="Could not load your claims" body="Check your connection and try again." />;
  if ((claims.data ?? []).length === 0) {
    return <EmptyState title="No claims yet" body="Medical claims you send will show here with their status." />;
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
      {(claims.data ?? []).map((c) => (
        <li key={c.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{money(c.amount, c.currency)}</p>
              <p className="text-sm text-muted">
                {c.clinic}, {claimDate.format(new Date(`${c.visit_date}T00:00:00Z`))}
              </p>
            </div>
            <DecisionStatus status={c.status} />
          </div>
          {c.decision_note ? <p className="text-sm">Note from HR: {c.decision_note}</p> : null}
        </li>
      ))}
    </ul>
  );
}