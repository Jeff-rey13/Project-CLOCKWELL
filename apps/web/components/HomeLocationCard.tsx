'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { House } from '@phosphor-icons/react';
import { ERRORS, workModeLabel } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { getFix } from '@/lib/geo';
import { useWorkplace } from '@/lib/queries';
import { useSession } from '@/lib/session';

/** Lets hybrid and remote staff register where they work from home. HR approves it. */
export function HomeLocationCard() {
  const workplace = useWorkplace();
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const wp = workplace.data;
  if (!wp) return null;
  const mode = wp.rules?.work_mode_override ?? wp.office.work_mode;
  if (mode !== 'hybrid' && mode !== 'remote') return null;
  const status = wp.rules?.home_status ?? 'none';

  const register = async () => {
    setBusy(true);
    try {
      const fix = await getFix();
      const res = await callFunction(client, 'request-home-location', {
        lat: fix.lat,
        lng: fix.lng,
        accuracy_m: fix.accuracyM,
      });
      if (!res.ok) {
        toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['workplace'] });
      toast('Home location sent to HR for approval.');
    } catch {
      toast(`${ERRORS.LOCATION_DENIED.message} ${ERRORS.LOCATION_DENIED.nextStep}`, 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold">
          <House size={18} aria-hidden /> Home location
        </p>
        <Chip tone="outline">
          {status === 'approved' ? 'Approved' : status === 'pending' ? 'Waiting for HR' : 'Not set'}
        </Chip>
      </div>
      <p className="mb-3 text-sm text-muted">
        You work {workModeLabel[mode].toLowerCase()}. Register your home while you are there, so clocking in from home
        is recognised. Your location is read once, only when you press the button.
      </p>
      <Button variant="outline" onClick={register} loading={busy}>
        {status === 'none' ? 'Register this location as home' : 'Update to this location'}
      </Button>
    </Card>
  );
}
