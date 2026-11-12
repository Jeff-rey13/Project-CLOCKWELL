'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ERRORS, FLAGS, FLAG_DEFAULTS, FLAG_KEYS, resolveFlag, type FlagKey, type FlagRow } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Select';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { usePlatformCompanies } from '@/lib/platform-queries';
import { useSession } from '@/lib/session';

/** Feature flags (PRD 3.3): global value, per-company overrides, and rollout by release track. */
export default function FlagsPage() {
  const { client, platformRole } = useSession();
  const companies = usePlatformCompanies();
  const flags = useQuery({
    queryKey: ['platform-flags'],
    queryFn: async () => {
      const { data, error } = await client.from('feature_flags').select('key, company_id, enabled');
      if (error) throw new Error('load failed');
      return (data ?? []) as FlagRow[];
    },
  });
  const canEdit = platformRole === 'owner' || platformRole === 'engineer';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl">Feature flags</h1>
        <p className="text-sm text-muted">
          A company&apos;s own setting wins over the global one. Pilot companies can get a feature first.
        </p>
      </div>
      {flags.isLoading || companies.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        FLAG_KEYS.map((key) => (
          <FlagCard
            key={key}
            flagKey={key}
            rows={flags.data ?? []}
            companies={(companies.data ?? []).map((c) => ({ id: c.id, name: c.name, track: c.release_track }))}
            canEdit={canEdit}
          />
        ))
      )}
    </div>
  );
}

function FlagCard({
  flagKey,
  rows,
  companies,
  canEdit,
}: {
  flagKey: FlagKey;
  rows: FlagRow[];
  companies: Array<{ id: string; name: string; track: 'pilot' | 'stable' }>;
  canEdit: boolean;
}) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');
  const globalRow = rows.find((r) => r.key === flagKey && r.company_id === null);
  const global = globalRow ? globalRow.enabled : FLAG_DEFAULTS[flagKey];
  const overrides = rows.filter((r) => r.key === flagKey && r.company_id !== null);

  const run = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    const res = await callFunction(client, 'ops-action', body);
    setBusy(false);
    if (!res.ok) return toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
    await queryClient.invalidateQueries({ queryKey: ['platform-flags'] });
    toast(ok);
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-mono text-sm font-semibold">{flagKey}</p>
        <p className="text-sm text-muted">{FLAGS[flagKey]}</p>
      </div>
      <div className="rounded-box border border-line px-3">
        <Toggle
          label="On for everyone (global)"
          hint={globalRow ? undefined : 'Using the built-in default'}
          checked={global}
          onChange={(v) => canEdit && !busy && run({ action: 'set_flag', key: flagKey, company_id: null, enabled: v }, 'Global value saved.')}
        />
      </div>
      {overrides.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {overrides.map((o) => {
            const c = companies.find((x) => x.id === o.company_id);
            return (
              <li key={o.company_id} className="flex items-center justify-between gap-2 rounded-box bg-soft px-3 py-2 text-sm">
                <span>
                  {c?.name ?? 'Company'} <Chip tone={o.enabled ? 'soft' : 'outline'}>{o.enabled ? 'on' : 'off'}</Chip>
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run({ action: 'set_flag', key: flagKey, company_id: o.company_id, enabled: null }, 'Override removed.')}
                    className="min-h-9 text-sm font-medium underline underline-offset-4"
                  >
                    Follow global
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {canEdit ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Select
              label="Override for a company"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              options={[{ value: '', label: 'Choose a company' }, ...companies.map((c) => ({ value: c.id, label: `${c.name} (${c.track})` }))]}
            />
          </div>
          <Button
            variant="outline"
            disabled={!pick || busy}
            onClick={() =>
              run(
                { action: 'set_flag', key: flagKey, company_id: pick, enabled: !resolveFlag(rows, flagKey, pick) },
                'Company override saved.',
              )
            }
          >
            {pick ? (resolveFlag(rows, flagKey, pick) ? 'Turn off for them' : 'Turn on for them') : 'Set'}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run({ action: 'set_flag_for_track', key: flagKey, track: 'pilot', enabled: true }, 'On for all pilot companies.')}
          >
            On for pilot companies
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
