'use client';

import { useId, useState, type ReactNode } from 'react';
import { ERRORS } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { useSession } from '@/lib/session';

/**
 * One pending item for HR: details, an optional note to the employee, Reject and Approve.
 * `body(approve, note)` builds the function input.
 */
export function DecisionRow({
  title,
  details,
  badge,
  ownerId,
  fn,
  body,
  onDone,
  approvedText = 'Approved.',
  rejectedText = 'Rejected.',
}: {
  title: ReactNode;
  details: ReactNode;
  badge?: ReactNode;
  ownerId: string;
  fn: string;
  body: (approve: boolean, note: string) => Record<string, unknown>;
  onDone: () => Promise<unknown> | void;
  approvedText?: string;
  rejectedText?: string;
}) {
  const { client, profile } = useSession();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const own = ownerId === profile?.user_id;
  const noteId = useId();

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'reject');
    const res = await callFunction(client, fn, body(approve, note));
    setBusy(null);
    if (!res.ok) {
      toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
      return;
    }
    await onDone();
    toast(approve ? approvedText : rejectedText);
  };

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="text-sm text-muted">{details}</div>
        </div>
        {badge}
      </div>
      {own ? (
        <p className="text-sm text-muted">This is your own request. Another HR admin must decide it.</p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-medium">
              Note to employee (optional)
            </label>
            <input
              id={noteId}
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
