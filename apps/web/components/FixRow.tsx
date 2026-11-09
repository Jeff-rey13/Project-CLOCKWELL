'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ERRORS, correctionReasonLabel } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localTime, type CorrectionRow } from '@/lib/queries';
import { useSession } from '@/lib/session';

const TZ = 'Asia/Singapore';

/** A pending time fix with Approve and Reject, for HR. */
export function FixRow({ fix, who }: { fix: CorrectionRow; who: string }) {
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
