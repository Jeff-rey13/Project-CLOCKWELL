'use client';

import { useQueryClient } from '@tanstack/react-query';
import { DecisionRow } from '@/components/DecisionRow';
import { DecisionStatus } from '@/components/DecisionStatus';
import { ReceiptLinks } from '@/components/ReceiptLinks';
import { Card, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { money, useCompanyClaims } from '@/lib/queries';

const dateFmt = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const day = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

export default function HrClaimsPage() {
  const claims = useCompanyClaims();
  const queryClient = useQueryClient();
  const rows = claims.data ?? [];
  const pending = rows.filter((c) => c.status === 'pending');
  const decided = rows.filter((c) => c.status !== 'pending').slice(0, 30);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hr-claims'] });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-3xl">Medical claims</h1>
      <Card>
        <CardTitle className="mb-3">Waiting for you ({pending.length})</CardTitle>
        {claims.isLoading ? (
          <ListSkeleton rows={3} />
        ) : claims.isError ? (
          <EmptyState title="Could not load claims" body="Check your connection and try again." />
        ) : pending.length === 0 ? (
          <EmptyState title="All caught up" body="New claims will show here." />
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((c) => (
              <DecisionRow
                key={c.id}
                ownerId={c.user_id}
                fn="decide-claim"
                body={(approve, note) => ({ claim_id: c.id, approve, note })}
                onDone={refresh}
                approvedText="Claim approved."
                rejectedText="Claim rejected."
                title={
                  <>
                    {c.profiles?.full_name ?? 'Employee'}{' '}
                    <span className="font-mono text-xs font-normal text-muted">{c.profiles?.employee_code}</span>
                  </>
                }
                details={
                  <div className="flex flex-col gap-1">
                    <span>
                      {money(c.amount, c.currency)} at {c.clinic}, visit {day(c.visit_date)}
                    </span>
                    <ReceiptLinks paths={c.receipt_paths} />
                  </div>
                }
                badge={<DecisionStatus status={c.status} />}
              />
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
            {decided.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{c.profiles?.full_name ?? 'Employee'}</p>
                  <p className="text-sm text-muted">
                    {money(c.amount, c.currency)}, {c.clinic}, {day(c.visit_date)}
                  </p>
                  {c.decision_note ? <p className="text-sm">Note: {c.decision_note}</p> : null}
                </div>
                <DecisionStatus status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
