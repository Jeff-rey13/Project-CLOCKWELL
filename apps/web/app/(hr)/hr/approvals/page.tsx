'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DecisionRow } from '@/components/DecisionRow';
import { DecisionStatus } from '@/components/DecisionStatus';
import { FixRow } from '@/components/FixRow';
import { fmtDays, leaveRange } from '@/components/LeaveStatus';
import { ReceiptLinks } from '@/components/ReceiptLinks';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { money, useCompanyClaims, useCompanyCorrections, useCompanyLeave, usePeopleNames } from '@/lib/queries';
import { cn } from '@/lib/cn';

type Tab = 'leave' | 'claims' | 'fixes';

/** One place for everything waiting on HR (PRD screen 13: tabs Leave / Claims / Time fixes). */
export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>('leave');
  const leave = useCompanyLeave();
  const claims = useCompanyClaims();
  const fixes = useCompanyCorrections();
  const people = usePeopleNames();
  const queryClient = useQueryClient();

  const pendingLeave = (leave.data ?? []).filter((r) => r.status === 'pending');
  const pendingClaims = (claims.data ?? []).filter((c) => c.status === 'pending');
  const pendingFixes = (fixes.data ?? []).filter((f) => f.status === 'pending');
  const counts: Record<Tab, number> = { leave: pendingLeave.length, claims: pendingClaims.length, fixes: pendingFixes.length };
  const labels: Record<Tab, string> = { leave: 'Leave', claims: 'Claims', fixes: 'Time fixes' };
  const loading = leave.isLoading || claims.isLoading || fixes.isLoading;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4">
      <h1 className="text-3xl">Approvals</h1>
      <div role="tablist" aria-label="Approval type" className="grid grid-cols-3 rounded-full border border-line bg-surface p-1">
        {(Object.keys(labels) as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'min-h-10 rounded-full px-2 text-sm font-semibold',
              tab === t ? 'bg-solid text-on-solid' : 'text-muted',
            )}
          >
            {labels[t]} {counts[t] ? `(${counts[t]})` : ''}
          </button>
        ))}
      </div>

      <Card role="tabpanel" aria-label={labels[tab]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : counts[tab] === 0 ? (
          <EmptyState title="All caught up" body={`No ${labels[tab].toLowerCase()} waiting for you.`} />
        ) : tab === 'leave' ? (
          <ul className="divide-y divide-line">
            {pendingLeave.map((r) => (
              <DecisionRow
                key={r.id}
                ownerId={r.user_id}
                fn="decide-leave"
                body={(approve, note) => ({ request_id: r.id, approve, note })}
                onDone={() => queryClient.invalidateQueries({ queryKey: ['hr-leave'] })}
                approvedText="Leave approved."
                rejectedText="Leave rejected."
                title={r.profiles?.full_name ?? 'Employee'}
                details={
                  <>
                    {r.leave_types?.name}, {leaveRange(r)}, {fmtDays(r.days)}
                    {r.reason ? <span className="block text-fg">{r.reason}</span> : null}
                  </>
                }
                badge={<DecisionStatus status={r.status} />}
              />
            ))}
          </ul>
        ) : tab === 'claims' ? (
          <ul className="divide-y divide-line">
            {pendingClaims.map((c) => (
              <DecisionRow
                key={c.id}
                ownerId={c.user_id}
                fn="decide-claim"
                body={(approve, note) => ({ claim_id: c.id, approve, note })}
                onDone={() => queryClient.invalidateQueries({ queryKey: ['hr-claims'] })}
                approvedText="Claim approved."
                rejectedText="Claim rejected."
                title={c.profiles?.full_name ?? 'Employee'}
                details={
                  <span className="flex flex-col gap-1">
                    <span>
                      {money(c.amount, c.currency)} at {c.clinic}
                    </span>
                    <ReceiptLinks paths={c.receipt_paths} />
                  </span>
                }
                badge={<DecisionStatus status={c.status} />}
              />
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-line">
            {pendingFixes.map((f) => (
              <FixRow
                key={f.id}
                fix={f}
                who={people.data?.get(f.attendance?.user_id ?? f.requested_by)?.full_name ?? 'Employee'}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
