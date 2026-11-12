'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UploadSimple } from '@phosphor-icons/react';
import { ERRORS } from '@app/shared';
import { TwoStep } from '@/components/TwoStep';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { useEmployees } from '@/lib/hr-queries';
import { usePeopleNames } from '@/lib/queries';
import { useSession } from '@/lib/session';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SHARED_SUPABASE_URL ?? '';
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost';
const dateTime = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Singapore' });

interface CompanyData {
  company: { id: string; name: string; slug: string; logo_path: string | null; plan: string; seat_limit: number; status: string };
  settings: { selfie_retention_days: number; record_retention_days: number; modules: Record<string, boolean> };
  seatsUsed: number;
  grants: Array<{ id: string; reason: string; ticket_ref: string | null; expires_at: string; revoked_at: string | null; granted_by: string; created_at: string }>;
  log: Array<{ id: number; action: string; actor_id: string | null; actor_type: string; created_at: string }>;
  activeGrantId: string | null;
}

function useCompany() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: ['hr-company', profile?.company_id ?? ''],
    enabled: profile?.app_role === 'hr',
    queryFn: async (): Promise<CompanyData> => {
      const [company, settings, seats, grants, log] = await Promise.all([
        client.from('companies').select('id, name, slug, logo_path, plan, seat_limit, status').single(),
        client.from('company_settings').select('selfie_retention_days, record_retention_days, modules').single(),
        client.from('profiles').select('user_id', { count: 'exact', head: true }).neq('status', 'offboarded'),
        client.from('support_grants').select('*').order('created_at', { ascending: false }).limit(20),
        client
          .from('audit_log')
          .select('id, action, actor_id, actor_type, created_at')
          .like('action', 'support.%')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);
      if (company.error || settings.error || grants.error || log.error) throw new Error('load failed');
      const now = Date.now();
      const grantRows = (grants.data ?? []) as CompanyData['grants'];
      return {
        activeGrantId: grantRows.find((g) => !g.revoked_at && new Date(g.expires_at).getTime() > now)?.id ?? null,
        company: company.data as CompanyData['company'],
        settings: settings.data as CompanyData['settings'],
        seatsUsed: seats.count ?? 0,
        grants: (grants.data ?? []) as CompanyData['grants'],
        log: (log.data ?? []) as CompanyData['log'],
      };
    },
  });
}

export default function SettingsPage() {
  const data = useCompany();
  if (data.isLoading) return <ListSkeleton rows={6} />;
  if (data.isError || !data.data) return <EmptyState title="Could not load settings" body="Check your connection and try again." />;
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-6">
      <h1 className="text-3xl">Company settings</h1>
      <Branding data={data.data} />
      <Plan data={data.data} />
      <SupportAccess data={data.data} />
      <HrAdmins />
    </div>
  );
}

function Branding({ data }: { data: CompanyData }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(data.company.name);
  const [selfieDays, setSelfieDays] = useState(String(data.settings.selfie_retention_days));
  const [recordDays, setRecordDays] = useState(String(data.settings.record_retention_days));
  const [logoPath, setLogoPath] = useState<string | null>(data.company.logo_path);
  const [logoVersion, setLogoVersion] = useState(0);
  const [busy, setBusy] = useState<'save' | 'logo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const address = ROOT_DOMAIN === 'localhost' ? `localhost:3000/login/?company=${data.company.slug}` : `${data.company.slug}.${ROOT_DOMAIN}`;

  const save = async (nextLogo: string | null = logoPath) => {
    setError(null);
    setBusy('save');
    const res = await callFunction(client, 'save-company-settings', {
      name,
      logo_path: nextLogo,
      selfie_retention_days: Number(selfieDays),
      record_retention_days: Number(recordDays),
    });
    setBusy(null);
    if (!res.ok) {
      setError(
        res.code === 'VALIDATION_FAILED'
          ? 'Selfies are kept 7 to 3,650 days; records 30 to 3,650 days.'
          : `${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`,
      );
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ['hr-company'] });
    toast('Settings saved.');
    return true;
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.type !== 'image/png') return setError('Use a PNG logo.');
    if (file.size > 1024 * 1024) return setError('The logo must be 1 MB or smaller.');
    setBusy('logo');
    const path = `${data.company.id}/logo.png`;
    const up = await client.storage.from('logos').upload(path, file, { contentType: 'image/png', upsert: true });
    setBusy(null);
    if (up.error) return setError(`${ERRORS.SERVER_ERROR.message} ${ERRORS.SERVER_ERROR.nextStep}`);
    setLogoPath(path);
    setLogoVersion(Date.now());
    await save(path);
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Branding and data</CardTitle>
      <div className="flex items-center gap-4">
        {logoPath ? (
          // Public logo; the version query refreshes it after an upload.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${SUPABASE_URL}/storage/v1/object/public/logos/${logoPath}?v=${logoVersion}`}
            alt={`${data.company.name} logo`}
            className="size-16 rounded-card border border-line bg-white object-contain p-1"
          />
        ) : (
          <div aria-hidden className="flex size-16 items-center justify-center rounded-card bg-solid text-2xl font-bold text-on-solid">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold">
          <UploadSimple size={18} aria-hidden /> {busy === 'logo' ? 'Uploading' : 'Upload logo (PNG)'}
          <input type="file" accept="image/png" className="sr-only" onChange={(e) => uploadLogo(e.target.files?.[0])} />
        </label>
      </div>
      <Input label="Company name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input label="Sign-in address" value={address} readOnly hint="Staff sign in here. Contact us to change it." />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Keep selfies (days)"
          type="number"
          min="7"
          max="3650"
          value={selfieDays}
          onChange={(e) => setSelfieDays(e.target.value)}
          hint="Then deleted automatically"
        />
        <Input
          label="Keep records (days)"
          type="number"
          min="30"
          max="3650"
          value={recordDays}
          onChange={(e) => setRecordDays(e.target.value)}
        />
      </div>
      <p className="text-sm text-muted">
        A data processing agreement (DPA) is part of your contract. Ask your account manager for a signed copy.
        Full data export arrives in the next release.
      </p>
      {error ? (
        <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={() => void save()} loading={busy === 'save'} className="self-start">
        Save settings
      </Button>
    </Card>
  );
}

function Plan({ data }: { data: CompanyData }) {
  const modules = Object.entries(data.settings.modules ?? {});
  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Plan</CardTitle>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted">Plan</dt>
        <dd className="text-right capitalize">{data.company.plan}</dd>
        <dt className="text-muted">Seats used</dt>
        <dd className="text-right">
          {data.seatsUsed} of {data.company.seat_limit}
        </dd>
        <dt className="text-muted">Status</dt>
        <dd className="text-right capitalize">{data.company.status}</dd>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {modules.map(([k, on]) => (
          <Chip key={k} tone={on ? 'soft' : 'outline'}>
            {k.replace('_', ' ')}: {on ? 'on' : 'off'}
          </Chip>
        ))}
      </div>
      <p className="text-sm text-muted">To add seats or modules, contact your account manager.</p>
    </Card>
  );
}

function SupportAccess({ data }: { data: CompanyData }) {
  const { client } = useSession();
  const people = usePeopleNames();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [ticket, setTicket] = useState('');
  const [days, setDays] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = data.grants.find((g) => g.id === data.activeGrantId);

  const grant = async () => {
    setError(null);
    if (reason.trim().length < 5) return setError('Say why support needs access.');
    setBusy(true);
    const res = await callFunction(client, 'grant-support-access', { reason, ticket_ref: ticket, days: Number(days) });
    setBusy(false);
    if (!res.ok) return setError(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`);
    setReason('');
    setTicket('');
    await queryClient.invalidateQueries({ queryKey: ['hr-company'] });
    toast('Support access granted.');
  };

  const end = async (id: string) => {
    setBusy(true);
    const res = await callFunction(client, 'revoke-support-access', { grant_id: id });
    setBusy(false);
    if (!res.ok) return toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
    await queryClient.invalidateQueries({ queryKey: ['hr-company'] });
    toast('Support access ended.');
  };

  const actionLabel: Record<string, string> = {
    'support.granted': 'Access granted',
    'support.revoked': 'Access ended',
    'support.viewed': 'Support viewed data',
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>Support access</CardTitle>
      <p className="text-sm text-muted">
        Our support team cannot see your staff data unless you allow it here, for up to 7 days. Every view is logged below.
      </p>
      {active ? (
        <div className="flex flex-col gap-2 rounded-box border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-semibold">Active until {dateTime.format(new Date(active.expires_at))}</p>
            <p className="text-muted">
              {active.reason}
              {active.ticket_ref ? ` · ${active.ticket_ref}` : ''}
            </p>
          </div>
          <Button variant="danger" onClick={() => end(active.id)} loading={busy}>
            End now
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Ticket reference (optional)" value={ticket} onChange={(e) => setTicket(e.target.value)} />
            <Select
              label="For"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              options={[1, 2, 3, 5, 7].map((d) => ({ value: String(d), label: `${d} ${d === 1 ? 'day' : 'days'}` }))}
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button variant="outline" onClick={grant} loading={busy} className="self-start">
            Grant access
          </Button>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Access log</h3>
        {data.log.length === 0 ? (
          <p className="text-sm text-muted">No support activity yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {data.log.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span>
                  {actionLabel[l.action] ?? l.action}
                  {l.actor_type === 'hr' && l.actor_id ? ` by ${people.data?.get(l.actor_id)?.full_name ?? 'HR'}` : ''}
                  {l.actor_type === 'platform' ? ' by support' : ''}
                </span>
                <span className="shrink-0 text-muted">{dateTime.format(new Date(l.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function HrAdmins() {
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const employees = useEmployees();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const admins = useQuery({
    queryKey: ['hr-admins', profile?.company_id ?? ''],
    queryFn: async () => {
      const { data, error } = await client.rpc('hr_admins');
      if (error) throw new Error('load failed');
      return (data ?? []) as Array<{ user_id: string; full_name: string; username: string; mfa_enabled: boolean }>;
    },
  });
  const candidates = (employees.data?.employees ?? []).filter((e) => e.app_role === 'employee' && e.status === 'active');
  const me = admins.data?.find((a) => a.user_id === profile?.user_id);

  const add = async () => {
    const e = candidates.find((c) => c.user_id === pick);
    if (!e || !e.office_id || !e.start_date) return;
    setBusy(true);
    const res = await callFunction(client, 'update-employee', {
      user_id: e.user_id,
      full_name: e.full_name,
      department: e.department ?? '',
      office_id: e.office_id,
      start_date: e.start_date,
      app_role: 'hr',
    });
    setBusy(false);
    if (!res.ok) return toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
    setPick('');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hr-admins'] }),
      queryClient.invalidateQueries({ queryKey: ['hr-employees'] }),
    ]);
    toast(`${e.full_name} is now an HR admin. They will need two-step sign-in.`);
  };

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>HR admins</CardTitle>
      {admins.isLoading ? (
        <ListSkeleton rows={2} />
      ) : (
        <ul className="divide-y divide-line">
          {(admins.data ?? []).map((a) => (
            <li key={a.user_id} className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm">
                <span className="font-semibold">{a.full_name}</span> <span className="text-muted">{a.username}</span>
              </span>
              <Chip tone={a.mfa_enabled ? 'soft' : 'outline'}>{a.mfa_enabled ? 'Two-step on' : 'Two-step off'}</Chip>
            </li>
          ))}
        </ul>
      )}
      {me && !me.mfa_enabled ? (
        <Button variant="outline" onClick={() => setSetup(true)} className="self-start">
          <ShieldCheck size={18} aria-hidden /> Set up my two-step sign-in
        </Button>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select
            label="Add an HR admin"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            options={[
              { value: '', label: 'Choose an employee' },
              ...candidates.map((c) => ({ value: c.user_id, label: `${c.full_name} (${c.employee_code})` })),
            ]}
          />
        </div>
        <Button onClick={add} disabled={!pick} loading={busy}>
          Make HR admin
        </Button>
      </div>
      <Sheet open={setup} title="Two-step sign-in" onClose={() => setSetup(false)}>
        {setup ? (
          <TwoStep
            onDone={() => {
              void queryClient.invalidateQueries({ queryKey: ['hr-admins'] });
              toast('Two-step sign-in is on.');
            }}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}
