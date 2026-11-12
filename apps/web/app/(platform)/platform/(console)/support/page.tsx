'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye } from '@phosphor-icons/react';
import { ERRORS, SUPPORT_VIEWS, supportViewLabel, workModeLabel, type SupportView, type WorkMode } from '@app/shared';
import { Card } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { callFunction } from '@/lib/api';
import { usePlatformCompanies } from '@/lib/platform-queries';
import { localDate, localTime, money } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

const TZ = 'Asia/Singapore';
const dateTime = new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ });
const day = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const d = (s: string) => day.format(new Date(`${s.slice(0, 10)}T00:00:00Z`));

interface Result {
  view: SupportView;
  expires_at: string;
  rows: Array<Record<string, unknown>>;
  names: Record<string, string>;
}

export default function SupportPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <SupportView />
    </Suspense>
  );
}

/** Read-only view of one company's data, only while that company has granted access. Every load is logged. */
function SupportView() {
  const companyId = useSearchParams().get('company') ?? '';
  const companies = usePlatformCompanies();
  const company = companies.data?.find((c) => c.id === companyId);
  const { client } = useSession();
  const [view, setView] = useState<SupportView>('employees');
  const [date, setDate] = useState(() => localDate(new Date(), TZ));

  const data = useQuery({
    queryKey: ['support-view', companyId, view, view === 'attendance' ? date : ''],
    enabled: !!companyId,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const res = await callFunction<Result>(client, 'support-view', {
        company_id: companyId,
        view,
        ...(view === 'attendance' ? { date } : {}),
      });
      if (!res.ok) throw new Error(res.code);
      return res.data;
    },
  });

  const name = (id: unknown) => data.data?.names[String(id)] ?? 'Employee';
  const errorCode = data.error?.message as keyof typeof ERRORS | undefined;

  return (
    <div className="flex flex-col gap-5">
      <Link
        href={company ? `/platform/company/?id=${company.id}` : '/platform/companies/'}
        className="flex min-h-10 items-center gap-1.5 self-start text-sm font-medium"
      >
        <ArrowLeft size={16} aria-hidden /> {company?.name ?? 'Companies'}
      </Link>

      <div role="status" className="flex flex-col gap-1 rounded-card border-2 border-fg bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 font-bold">
          <Eye size={20} aria-hidden /> Support view of {company?.name ?? 'company'}: read only
        </p>
        <p className="text-sm text-muted">
          Every view is logged and shown to the company&apos;s HR.
          {data.data ? ` Access ends ${dateTime.format(new Date(data.data.expires_at))}.` : ''}
        </p>
      </div>

      <div role="tablist" aria-label="Data" className="flex flex-wrap gap-1 rounded-full border border-line bg-surface p-1 sm:self-start">
        {SUPPORT_VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            type="button"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn('min-h-10 rounded-full px-4 text-sm font-semibold', view === v ? 'bg-solid text-on-solid' : 'text-muted')}
          >
            {supportViewLabel[v]}
          </button>
        ))}
      </div>

      {view === 'attendance' ? (
        <div className="max-w-xs">
          <Input label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      ) : null}

      <Card role="tabpanel" aria-label={supportViewLabel[view]} className="relative w-full min-w-0 overflow-x-auto">
        {data.isLoading ? (
          <ListSkeleton rows={4} />
        ) : data.isError ? (
          <EmptyState
            title={errorCode === 'SUPPORT_GRANT_REQUIRED' ? 'No active support access' : 'Could not load'}
            body={
              errorCode === 'SUPPORT_GRANT_REQUIRED'
                ? 'The company has not granted access, or it has ended. Their HR can grant it in Company settings.'
                : errorCode && errorCode in ERRORS
                  ? ERRORS[errorCode].message
                  : 'Try again in a moment.'
            }
          />
        ) : (data.data?.rows.length ?? 0) === 0 ? (
          <EmptyState title="Nothing to show" />
        ) : (
          <Rows view={view} rows={data.data!.rows} name={name} />
        )}
      </Card>
    </div>
  );
}

function Rows({ view, rows, name }: { view: SupportView; rows: Array<Record<string, unknown>>; name: (id: unknown) => string }) {
  const s = (v: unknown) => (v === null || v === undefined ? '-' : String(v));
  if (view === 'employees') {
    return (
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={s(r.user_id)} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold">{s(r.full_name)}</span>{' '}
              <span className="font-mono text-xs text-muted">{s(r.employee_code)}</span>
              <span className="block text-muted">
                {s(r.department)} · {r.app_role === 'hr' ? 'HR' : 'Employee'}
              </span>
            </span>
            <Chip tone="outline">{s(r.status)}</Chip>
          </li>
        ))}
      </ul>
    );
  }
  if (view === 'attendance') {
    return (
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={s(r.id)} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold">{name(r.user_id)}</span>
              <span className="block font-mono text-xs text-muted">
                {localTime(s(r.effective_clock_in_at), TZ)}
                {r.effective_clock_out_at ? ` to ${localTime(s(r.effective_clock_out_at), TZ)}` : ' (still in)'}
              </span>
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              <StatusChip status={r.status as 'on_time' | 'grace' | 'late'} />
              {r.is_corrected ? <Chip tone="outline">Corrected</Chip> : null}
              {(r.flags as string[]).includes('outside_zone') ? <Chip tone="danger">Check location</Chip> : null}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (view === 'leave') {
    return (
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={s(r.id)} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold">{name(r.user_id)}</span>
              <span className="block text-muted">
                {(r.leave_types as { name?: string } | null)?.name ?? 'Leave'}, {d(s(r.start_date))} to {d(s(r.end_date))}, {s(r.days)} days
              </span>
            </span>
            <Chip tone="outline">{s(r.status)}</Chip>
          </li>
        ))}
      </ul>
    );
  }
  if (view === 'claims') {
    return (
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={s(r.id)} className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold">{name(r.user_id)}</span>
              <span className="block text-muted">
                {money(Number(r.amount), s(r.currency))} at {s(r.clinic)}, {d(s(r.visit_date))}
              </span>
            </span>
            <Chip tone="outline">{s(r.status)}</Chip>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={s(r.id)} className="py-2.5">
          <span className="font-semibold">{s(r.name)}</span>{' '}
          <Chip tone="outline">{workModeLabel[r.work_mode as WorkMode]}</Chip>
          <span className="block text-muted">
            Shift {s(r.shift_start).slice(0, 5)} to {s(r.shift_end).slice(0, 5)}, {s(r.grace_minutes)} min grace,{' '}
            {(r.sites as unknown[]).length} sites
          </span>
        </li>
      ))}
    </ul>
  );
}
