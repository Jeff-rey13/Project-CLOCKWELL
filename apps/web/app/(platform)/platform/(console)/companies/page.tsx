'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from '@phosphor-icons/react';
import { ERRORS, PLANS, RELEASE_TRACKS } from '@app/shared';
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
import { attentionReason, companyAddress, usePlatformCompanies, type PlatformCompany } from '@/lib/platform-queries';
import { useSession } from '@/lib/session';

const statusTone = (s: PlatformCompany['status']) => (s === 'suspended' || s === 'pending_deletion' ? 'danger' : s === 'active' ? 'soft' : 'outline');

export default function CompaniesPage() {
  const companies = usePlatformCompanies();
  const { platformRole } = useSession();
  const [creating, setCreating] = useState(false);
  const list = companies.data ?? [];
  const attention = list.map((c) => ({ c, why: attentionReason(c) })).filter((x) => x.why);
  const canEdit = platformRole === 'owner' || platformRole === 'engineer';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Companies</h1>
        {canEdit ? (
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden /> New company
          </Button>
        ) : null}
      </div>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Companies" value={companies.isLoading ? null : list.length} />
        <Kpi label="Active" value={companies.isLoading ? null : list.filter((c) => c.status === 'active').length} />
        <Kpi label="Seats in use" value={companies.isLoading ? null : list.reduce((s, c) => s + c.seats_used, 0)} />
        <Kpi label="Need attention" value={companies.isLoading ? null : attention.length} danger />
      </section>

      {attention.length > 0 ? (
        <Card>
          <CardTitle className="mb-2">Needs attention</CardTitle>
          <ul className="divide-y divide-line">
            {attention.map(({ c, why }) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link href={`/platform/company/?id=${c.id}`} className="font-semibold underline-offset-4 hover:underline">
                  {c.name}
                </Link>
                <span className="text-sm text-muted">{why}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {companies.isLoading ? (
        <ListSkeleton rows={4} />
      ) : companies.isError ? (
        <EmptyState title="Could not load companies" body="Check your connection and try again." />
      ) : list.length === 0 ? (
        <EmptyState title="No companies yet" body="Create the first company to send its HR admin an invite." />
      ) : (
        <Card className="relative w-full min-w-0 overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Address</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Seats</th>
                <th className="px-4 py-3 font-medium">Release track</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/platform/company/?id=${c.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{companyAddress(c.slug)}</td>
                  <td className="px-4 py-3 capitalize">{c.plan}</td>
                  <td className="px-4 py-3">
                    {c.seats_used} / {c.seat_limit}
                  </td>
                  <td className="px-4 py-3 capitalize">{c.release_track}</td>
                  <td className="px-4 py-3">
                    <Chip tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet open={creating} title="New company" onClose={() => setCreating(false)}>
        {creating ? <NewCompany onDone={() => setCreating(false)} /> : null}
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number | null; danger?: boolean }) {
  return (
    <Card className="p-3.5">
      <p className={`text-2xl font-bold tracking-tight ${danger && value ? 'text-danger' : ''}`}>{value ?? '-'}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

interface FormValues {
  name: string;
  slug: string;
  plan: string;
  seat_limit: string;
  release_track: string;
  hr_full_name: string;
  hr_email: string;
}

function NewCompany({ onDone }: { onDone: () => void }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = useForm<FormValues>({ defaultValues: { plan: 'business', seat_limit: '50', release_track: 'stable' } });

  const onSubmit = async (v: FormValues) => {
    setError(null);
    const res = await callFunction(client, 'platform-company', {
      action: 'create',
      name: v.name,
      slug: v.slug.trim().toLowerCase(),
      plan: v.plan,
      seat_limit: Number(v.seat_limit),
      release_track: v.release_track,
      hr_full_name: v.hr_full_name,
      hr_email: v.hr_email,
    });
    if (!res.ok) {
      setError(
        res.code === 'VALIDATION_FAILED'
          ? 'Check the details. The address may be taken, reserved or not valid (lowercase letters, numbers and dashes), or the HR email may already have an account.'
          : `${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`,
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['platform-companies'] });
    toast(`${v.name} created. The HR admin has been sent an invite.`);
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Input
        label="Company name"
        {...register('name', {
          onChange: (e) =>
            setValue(
              'slug',
              String(e.target.value)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40),
            ),
        })}
      />
      <Input label="Address" hint="Lowercase letters, numbers and dashes. Staff sign in here." {...register('slug')} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Plan" options={PLANS.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))} {...register('plan')} />
        <Input label="Seats" type="number" min="1" {...register('seat_limit')} />
      </div>
      <Select
        label="Release track"
        options={RELEASE_TRACKS.map((t) => ({ value: t, label: t === 'pilot' ? 'Pilot (gets releases first)' : 'Stable' }))}
        {...register('release_track')}
      />
      <h3 className="pt-2 font-bold">First HR admin</h3>
      <Input label="Full name" {...register('hr_full_name')} />
      <Input label="Work email" type="email" hint="The invite is sent here." {...register('hr_email')} />
      {error ? (
        <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" block loading={isSubmitting}>
        Create company and send invite
      </Button>
    </form>
  );
}
