'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from '@phosphor-icons/react';
import { ERRORS, MODULES, PLANS, RELEASE_TRACKS } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { companyAddress, usePlatformCompanies, type PlatformCompany } from '@/lib/platform-queries';
import { useSession } from '@/lib/session';

const dateTime = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' });
const moduleLabel: Record<(typeof MODULES)[number], string> = {
  attendance: 'Attendance',
  leave: 'Leave',
  claims: 'Medical claims',
  payroll_export: 'Payroll export',
};

export default function CompanyPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <CompanyDetail />
    </Suspense>
  );
}

function CompanyDetail() {
  const id = useSearchParams().get('id') ?? '';
  const companies = usePlatformCompanies();
  const company = companies.data?.find((c) => c.id === id);

  if (companies.isLoading) return <ListSkeleton rows={4} />;
  if (!company) return <EmptyState title="Company not found" body="Go back to the list and choose a company." />;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/platform/companies/" className="flex min-h-10 items-center gap-1.5 self-start text-sm font-medium">
        <ArrowLeft size={16} aria-hidden /> Companies
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">{company.name}</h1>
          <p className="font-mono text-xs text-muted">{companyAddress(company.slug)}</p>
        </div>
        <Chip tone={company.status === 'suspended' || company.status === 'pending_deletion' ? 'danger' : 'outline'}>
          {company.status.replace('_', ' ')}
        </Chip>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PlanCard key={`${company.id}-${company.plan}-${company.seat_limit}-${company.release_track}`} company={company} />
        <div className="flex flex-col gap-4">
          <Support company={company} />
        </div>
      </div>
      <Actions company={company} />
    </div>
  );
}

function useCanEdit() {
  const { platformRole } = useSession();
  return platformRole === 'owner' || platformRole === 'engineer';
}

function PlanCard({ company }: { company: PlatformCompany }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [plan, setPlan] = useState<string>(company.plan);
  const [seats, setSeats] = useState(String(company.seat_limit));
  const [track, setTrack] = useState<string>(company.release_track);
  const [modules, setModules] = useState<Record<string, boolean>>({
    attendance: true,
    leave: true,
    claims: true,
    payroll_export: false,
    ...(company.modules ?? {}),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setBusy(true);
    const res = await callFunction(client, 'platform-company', {
      action: 'update',
      company_id: company.id,
      plan,
      seat_limit: Number(seats),
      release_track: track,
      modules,
    });
    setBusy(false);
    if (!res.ok) return setError(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`);
    await queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
    toast('Company updated.');
  };

  const version = useQuery({
    queryKey: ['platform-version'],
    queryFn: async () => {
      const { data } = await client.from('platform_settings').select('key, value');
      const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string]));
      return { current: map.get('current_version') ?? '-', min: map.get('min_app_version') ?? '-' };
    },
  });

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Plan and modules</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Plan"
          disabled={!canEdit}
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          options={PLANS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))}
        />
        <Input
          label="Seat limit"
          type="number"
          min="1"
          disabled={!canEdit}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          hint="Enforced inside the company"
        />
      </div>
      <Select
        label="Release track"
        disabled={!canEdit}
        value={track}
        onChange={(e) => setTrack(e.target.value)}
        options={RELEASE_TRACKS.map((t) => ({ value: t, label: t === 'pilot' ? 'Pilot' : 'Stable' }))}
      />
      <p className="text-sm text-muted">
        Running version <span className="font-mono text-fg">{version.data?.current ?? '-'}</span> (minimum app{' '}
        <span className="font-mono">{version.data?.min ?? '-'}</span>)
      </p>
      <div className="flex flex-col divide-y divide-line rounded-box border border-line px-3">
        {MODULES.map((m) => (
          <Toggle
            key={m}
            label={moduleLabel[m]}
            checked={!!modules[m]}
            onChange={(v) => canEdit && setModules((x) => ({ ...x, [m]: v }))}
          />
        ))}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {canEdit ? (
        <Button onClick={save} loading={busy} className="self-start">
          Save plan
        </Button>
      ) : (
        <p className="text-sm text-muted">Support role: read only.</p>
      )}
    </Card>
  );
}

function Support({ company }: { company: PlatformCompany }) {
  return (
    <Card>
      <CardTitle className="mb-2">Support access</CardTitle>
      {company.support_until ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            Granted by the company until <span className="font-semibold">{dateTime.format(new Date(company.support_until))}</span>.
          </p>
          <Link
            href={`/platform/support/?company=${company.id}`}
            className="flex min-h-11 items-center justify-center self-start rounded-full bg-solid px-5 text-[15px] font-semibold text-on-solid"
          >
            Open as support (logged)
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted">No active grant. The company&apos;s HR can grant access from their settings.</p>
      )}
    </Card>
  );
}

function Actions({ company }: { company: PlatformCompany }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const me = useQuery({
    queryKey: ['platform-me'],
    queryFn: async () => (await client.auth.getUser()).data.user?.id ?? null,
  });
  const requestedByMe = company.deletion_requested_by !== null && company.deletion_requested_by === me.data;

  const run = async (action: string, ok: string) => {
    setBusy(action);
    const res = await callFunction(client, 'platform-company', { action, company_id: company.id });
    setBusy(null);
    if (!res.ok) {
      toast(
        res.code === 'FORBIDDEN' && action === 'approve_deletion'
          ? 'A different platform admin must approve this deletion.'
          : `${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`,
        'danger',
      );
      return;
    }
    setConfirmName('');
    await queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
    toast(ok);
  };

  if (!canEdit) return null;
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Account actions</CardTitle>
      <div className="flex flex-wrap gap-2">
        {company.status === 'suspended' ? (
          <Button variant="outline" onClick={() => run('activate', 'Company reactivated.')} loading={busy === 'activate'}>
            Reactivate
          </Button>
        ) : company.status !== 'pending_deletion' ? (
          <Button variant="outline" onClick={() => run('suspend', 'Company suspended.')} loading={busy === 'suspend'}>
            Suspend
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-box border border-danger/40 p-3">
        <p className="font-semibold text-danger">Delete company</p>
        {company.status === 'pending_deletion' ? (
          <>
            <p className="text-sm">
              Data will be deleted on{' '}
              <span className="font-semibold">{company.deletion_scheduled_at ? dateTime.format(new Date(company.deletion_scheduled_at)) : '-'}</span>.
            </p>
            <Button variant="outline" onClick={() => run('cancel_deletion', 'Deletion cancelled.')} loading={busy === 'cancel_deletion'} className="self-start">
              Cancel deletion
            </Button>
          </>
        ) : company.deletion_requested_by ? (
          <>
            <p className="text-sm">
              Deletion has been requested{requestedByMe ? ' by you' : ''}. A second platform admin must approve it.
            </p>
            <div className="flex flex-wrap gap-2">
              {!requestedByMe ? (
                <Button variant="danger" onClick={() => run('approve_deletion', 'Deletion approved. Data is removed in 30 days.')} loading={busy === 'approve_deletion'}>
                  Approve deletion
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => run('cancel_deletion', 'Deletion request cancelled.')} loading={busy === 'cancel_deletion'}>
                Cancel request
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              Needs a second platform admin to approve, then data is removed after 30 days. Type the company name to confirm.
            </p>
            <Input label="Company name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <Button
              variant="danger"
              disabled={confirmName.trim() !== company.name}
              onClick={() => run('request_deletion', 'Deletion requested. Another platform admin must approve it.')}
              loading={busy === 'request_deletion'}
              className="self-start"
            >
              Request deletion
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
