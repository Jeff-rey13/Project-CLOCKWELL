'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Crosshair, Plus, Trash } from '@phosphor-icons/react';
import { ERRORS, TIMEZONES, WEEKDAYS, WORK_MODES, workModeLabel, type WorkMode } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { getFix } from '@/lib/geo';
import { usePeopleNames } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

interface OfficeRow {
  id: string;
  name: string;
  work_mode: WorkMode;
  timezone: (typeof TIMEZONES)[number];
  shift_start: string;
  shift_end: string;
  grace_minutes: number;
  home_days: number[];
  require_selfie: boolean;
  flag_outside: boolean;
  clockout_reminder: boolean;
  count_overtime: boolean;
}
interface SiteRow {
  id: string;
  office_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
}
interface RulesRow {
  user_id: string;
  work_mode_override: WorkMode | null;
  shift_start: string | null;
  shift_end: string | null;
  grace_minutes: number | null;
  home_days: number[] | null;
  home_lat: number | null;
  home_lng: number | null;
  home_radius_m: number;
  home_status: 'none' | 'pending' | 'approved';
}

function useOffices() {
  const { client, profile } = useSession();
  return useQuery({
    queryKey: ['hr-offices', profile?.company_id ?? ''],
    enabled: profile?.app_role === 'hr',
    queryFn: async () => {
      const [offices, sites, rules] = await Promise.all([
        client.from('offices').select('*').order('name'),
        client.from('sites').select('id, office_id, name, lat, lng, radius_m').order('name'),
        client.from('employee_rules').select('*'),
      ]);
      if (offices.error || sites.error || rules.error) throw new Error('load failed');
      return {
        offices: (offices.data ?? []) as OfficeRow[],
        sites: ((sites.data ?? []) as SiteRow[]).map((s) => ({ ...s, lat: Number(s.lat), lng: Number(s.lng) })),
        rules: ((rules.data ?? []) as RulesRow[]).map((r) => ({
          ...r,
          home_lat: r.home_lat === null ? null : Number(r.home_lat),
          home_lng: r.home_lng === null ? null : Number(r.home_lng),
        })),
      };
    },
  });
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

export default function OfficesPage() {
  const data = useOffices();
  const people = usePeopleNames();
  const [editing, setEditing] = useState<OfficeRow | 'new' | null>(null);
  const [personal, setPersonal] = useState<string | null>(null);
  const name = (id: string) => people.data?.get(id)?.full_name ?? 'Employee';
  const pendingHomes = (data.data?.rules ?? []).filter((r) => r.home_status === 'pending');

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Offices and work rules</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus size={18} aria-hidden /> New office
        </Button>
      </div>

      {data.isLoading ? (
        <ListSkeleton rows={3} />
      ) : data.isError ? (
        <EmptyState title="Could not load offices" body="Check your connection and try again." />
      ) : (data.data?.offices ?? []).length === 0 ? (
        <EmptyState title="No offices yet" body="Add an office so staff can clock in." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(data.data?.offices ?? []).map((o) => {
            const sites = (data.data?.sites ?? []).filter((s) => s.office_id === o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setEditing(o)}
                className="rounded-card border border-line bg-surface p-4 text-left hover:border-line-strong"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="font-bold">{o.name}</p>
                  <Chip tone="outline">{workModeLabel[o.work_mode]}</Chip>
                </div>
                <p className="text-sm text-muted">
                  Shift {hhmm(o.shift_start)} to {hhmm(o.shift_end)}, {o.grace_minutes} min grace
                </p>
                <p className="text-sm text-muted">
                  {sites.length} {sites.length === 1 ? 'site' : 'sites'}
                  {o.home_days.length
                    ? `, home on ${o.home_days.map((d) => WEEKDAYS[d - 1]?.short).join(', ')}`
                    : ''}
                </p>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <CardTitle className="mb-3">Home locations waiting ({pendingHomes.length})</CardTitle>
        {pendingHomes.length === 0 ? (
          <p className="text-sm text-muted">Staff who register a home location will show here for approval.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pendingHomes.map((r) => (
              <HomeRow key={r.user_id} rules={r} who={name(r.user_id)} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-1">Personal rules</CardTitle>
        <p className="mb-3 text-sm text-muted">Override the office rules for one person, or set their home location.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Select
              label="Employee"
              value={personal ?? ''}
              onChange={(e) => setPersonal(e.target.value || null)}
              options={[
                { value: '', label: 'Choose someone' },
                ...[...(people.data?.entries() ?? [])]
                  .map(([id, p]) => ({ value: id, label: `${p.full_name} (${p.employee_code})` }))
                  .sort((a, b) => a.label.localeCompare(b.label)),
              ]}
            />
          </div>
        </div>
        {personal ? (
          <PersonalRules
            key={personal}
            userId={personal}
            rules={(data.data?.rules ?? []).find((r) => r.user_id === personal) ?? null}
          />
        ) : null}
      </Card>

      <Sheet
        open={editing !== null}
        title={editing === 'new' ? 'New office' : editing ? editing.name : ''}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <OfficeEditor
            key={editing === 'new' ? 'new' : editing.id}
            office={editing === 'new' ? null : editing}
            sites={editing === 'new' ? [] : (data.data?.sites ?? []).filter((s) => s.office_id === editing.id)}
            onSaved={() => {
              // A new office closes the panel; open it again from the list to add sites.
              if (editing === 'new') setEditing(null);
            }}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['hr-offices'] }),
      queryClient.invalidateQueries({ queryKey: ['workplace'] }),
    ]);
}

function DaysPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Home days</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => {
          const on = value.includes(d.n);
          return (
            <button
              key={d.n}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== d.n) : [...value, d.n].sort())}
              className={cn(
                'min-h-11 min-w-12 rounded-full border px-3 text-sm font-semibold',
                on ? 'border-fg bg-solid text-on-solid' : 'border-line-strong bg-surface',
              )}
            >
              {d.short}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function OfficeEditor({ office, sites, onSaved }: { office: OfficeRow | null; sites: SiteRow[]; onSaved: () => void }) {
  const { client } = useSession();
  const toast = useToast();
  const refresh = useRefresh();
  const [o, setO] = useState<Omit<OfficeRow, 'id'> & { id?: string }>(
    office ?? {
      name: '',
      work_mode: 'onsite',
      timezone: 'Asia/Singapore',
      shift_start: '09:00',
      shift_end: '18:00',
      grace_minutes: 5,
      home_days: [],
      require_selfie: true,
      flag_outside: true,
      clockout_reminder: true,
      count_overtime: false,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => setO((x) => ({ ...x, [k]: v }));
  const homeAllowed = o.work_mode === 'hybrid' || o.work_mode === 'remote';

  const save = async () => {
    setError(null);
    if (!o.name.trim()) return setError('Enter a name for the office.');
    setBusy(true);
    const res = await callFunction(client, 'save-office', {
      ...o,
      shift_start: hhmm(o.shift_start),
      shift_end: hhmm(o.shift_end),
      home_days: homeAllowed ? o.home_days : [],
    });
    setBusy(false);
    if (!res.ok) return setError(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`);
    await refresh();
    toast('Office saved.');
    onSaved();
  };

  return (
    <div className="flex flex-col gap-4">
      <Input label="Office name" value={o.name} onChange={(e) => set('name', e.target.value)} />
      <Select
        label="Work mode"
        value={o.work_mode}
        onChange={(e) => set('work_mode', e.target.value as WorkMode)}
        options={WORK_MODES.map((m) => ({ value: m, label: workModeLabel[m] }))}
      />
      {homeAllowed ? <DaysPicker value={o.home_days} onChange={(v) => set('home_days', v)} /> : null}
      <div className="grid grid-cols-3 gap-3">
        <Input label="Shift start" type="time" value={hhmm(o.shift_start)} onChange={(e) => set('shift_start', e.target.value)} />
        <Input label="Shift end" type="time" value={hhmm(o.shift_end)} onChange={(e) => set('shift_end', e.target.value)} />
        <Input
          label="Grace (min)"
          type="number"
          min="0"
          max="120"
          value={String(o.grace_minutes)}
          onChange={(e) => set('grace_minutes', Number(e.target.value))}
        />
      </div>
      <Select
        label="Time zone"
        value={o.timezone}
        onChange={(e) => set('timezone', e.target.value as OfficeRow['timezone'])}
        options={TIMEZONES.map((t) => ({ value: t, label: t.replace('_', ' ') }))}
      />
      <div className="flex flex-col divide-y divide-line rounded-box border border-line px-3">
        <Toggle label="Selfie required" checked={o.require_selfie} onChange={(v) => set('require_selfie', v)} />
        <Toggle
          label="Flag clock-ins outside a site"
          hint="Never blocks clocking in"
          checked={o.flag_outside}
          onChange={(v) => set('flag_outside', v)}
        />
        <Toggle label="Remind to clock out" checked={o.clockout_reminder} onChange={(v) => set('clockout_reminder', v)} />
        <Toggle label="Count overtime" checked={o.count_overtime} onChange={(v) => set('count_overtime', v)} />
      </div>
      {error ? (
        <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button block onClick={save} loading={busy}>
        Save office
      </Button>

      {office ? <SitesEditor officeId={office.id} sites={sites} /> : (
        <p className="text-sm text-muted">Save the office first, then add its sites.</p>
      )}
    </div>
  );
}

function SitesEditor({ officeId, sites }: { officeId: string; sites: SiteRow[] }) {
  const { client } = useSession();
  const toast = useToast();
  const refresh = useRefresh();
  const blank = { name: '', lat: '', lng: '', radius_m: '150' };
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const useHere = async () => {
    setError(null);
    try {
      const f = await getFix();
      setDraft((d) => ({ ...d, lat: f.lat.toFixed(6), lng: f.lng.toFixed(6) }));
      if (f.accuracyM > 100) setError(ERRORS.GPS_WEAK.message);
    } catch {
      setError(`${ERRORS.LOCATION_DENIED.message} ${ERRORS.LOCATION_DENIED.nextStep}`);
    }
  };

  const add = async () => {
    setError(null);
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    if (!draft.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || draft.lat === '' || draft.lng === '') {
      return setError('Enter a name, latitude and longitude.');
    }
    setBusy('add');
    const res = await callFunction(client, 'save-site', {
      office_id: officeId,
      name: draft.name,
      lat,
      lng,
      radius_m: Number(draft.radius_m),
    });
    setBusy(null);
    if (!res.ok) return setError(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`);
    setDraft(blank);
    await refresh();
    toast('Site added.');
  };

  const remove = async (s: SiteRow) => {
    setBusy(s.id);
    const res = await callFunction(client, 'save-site', { ...s, office_id: officeId, delete: true });
    setBusy(null);
    if (!res.ok) return toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
    await refresh();
    toast('Site removed.');
  };

  return (
    <section aria-label="Sites" className="flex flex-col gap-3 border-t border-line pt-4">
      <h3 className="font-bold">Sites</h3>
      {sites.length === 0 ? (
        <p className="text-sm text-muted">No sites yet. Staff clocking in will be flagged as outside until you add one.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sites.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-box bg-soft px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="font-mono text-xs text-muted">
                  {s.lat.toFixed(5)}, {s.lng.toFixed(5)} · {s.radius_m} m
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${s.name}`}
                disabled={busy === s.id}
                onClick={() => remove(s)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger-soft"
              >
                <Trash size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 rounded-box border border-line p-3">
        <Input label="Site name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Latitude" inputMode="decimal" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: e.target.value })} />
          <Input label="Longitude" inputMode="decimal" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: e.target.value })} />
        </div>
        <Input
          label="Radius (m)"
          type="number"
          min="25"
          max="2000"
          hint="25 to 2,000 m"
          value={draft.radius_m}
          onChange={(e) => setDraft({ ...draft, radius_m: e.target.value })}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={useHere}>
            <Crosshair size={18} aria-hidden /> Use my current location
          </Button>
          <Button onClick={add} loading={busy === 'add'}>
            Add site
          </Button>
        </div>
      </div>
    </section>
  );
}

function HomeRow({ rules, who }: { rules: RulesRow; who: string }) {
  const { client } = useSession();
  const toast = useToast();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    const res = await callFunction(client, 'approve-home-location', { user_id: rules.user_id, approve });
    setBusy(false);
    if (!res.ok) return toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
    await refresh();
    toast(approve ? 'Home location approved.' : 'Home location rejected.');
  };
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">{who}</p>
        <p className="font-mono text-xs text-muted">
          {rules.home_lat?.toFixed(5)}, {rules.home_lng?.toFixed(5)} · {rules.home_radius_m} m
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => decide(false)} disabled={busy}>
          Reject
        </Button>
        <Button onClick={() => decide(true)} disabled={busy}>
          Approve
        </Button>
      </div>
    </li>
  );
}

function PersonalRules({ userId, rules }: { userId: string; rules: RulesRow | null }) {
  const { client } = useSession();
  const toast = useToast();
  const refresh = useRefresh();
  const [mode, setMode] = useState<string>(rules?.work_mode_override ?? '');
  const [start, setStart] = useState(hhmm(rules?.shift_start ?? null));
  const [end, setEnd] = useState(hhmm(rules?.shift_end ?? null));
  const [grace, setGrace] = useState(rules?.grace_minutes === null || rules?.grace_minutes === undefined ? '' : String(rules.grace_minutes));
  const [days, setDays] = useState<number[] | null>(rules?.home_days ?? null);
  const [lat, setLat] = useState(rules?.home_lat?.toString() ?? '');
  const [lng, setLng] = useState(rules?.home_lng?.toString() ?? '');
  const [radius, setRadius] = useState(String(rules?.home_radius_m ?? 200));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if ((lat === '') !== (lng === '')) return setError('Enter both latitude and longitude for the home location, or neither.');
    setBusy(true);
    const res = await callFunction(client, 'save-employee-rules', {
      user_id: userId,
      work_mode_override: mode || null,
      shift_start: start || null,
      shift_end: end || null,
      grace_minutes: grace === '' ? null : Number(grace),
      home_days: days,
      home_lat: lat === '' ? null : Number(lat),
      home_lng: lng === '' ? null : Number(lng),
      home_radius_m: Number(radius) || 200,
    });
    setBusy(false);
    if (!res.ok) return setError(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`);
    await refresh();
    toast('Personal rules saved.');
  };

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-muted">Leave a field empty to use the office value.</p>
      <Select
        label="Work mode"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        options={[{ value: '', label: 'Same as office' }, ...WORK_MODES.map((m) => ({ value: m, label: workModeLabel[m] }))]}
      />
      <div className="grid grid-cols-3 gap-3">
        <Input label="Shift start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        <Input label="Shift end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        <Input label="Grace (min)" type="number" min="0" max="120" value={grace} onChange={(e) => setGrace(e.target.value)} />
      </div>
      <Toggle label="Own home days" checked={days !== null} onChange={(v) => setDays(v ? [] : null)} />
      {days !== null ? <DaysPicker value={days} onChange={setDays} /> : null}
      <div className="grid grid-cols-3 gap-3">
        <Input label="Home latitude" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
        <Input label="Home longitude" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
        <Input label="Radius (m)" type="number" min="25" max="2000" value={radius} onChange={(e) => setRadius(e.target.value)} />
      </div>
      {rules?.home_status === 'approved' ? <p className="text-sm text-muted">Home location is approved.</p> : null}
      {error ? (
        <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button onClick={save} loading={busy} className="self-start">
        Save personal rules
      </Button>
    </div>
  );
}
