'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlass, UserPlus } from '@phosphor-icons/react';
import { ERRORS } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localDate } from '@/lib/queries';
import { useEmployees, type Employee } from '@/lib/hr-queries';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

const joined = new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default function EmployeesPage() {
  const data = useEmployees();
  const { profile } = useSession();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'active' | 'offboarded'>('active');
  const [panel, setPanel] = useState<{ mode: 'invite' } | { mode: 'edit'; employee: Employee } | null>(null);
  const [offboarding, setOffboarding] = useState<Employee | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.data?.employees ?? [])
      .filter((e) => (filter === 'offboarded' ? e.status === 'offboarded' : e.status !== 'offboarded'))
      .filter(
        (e) =>
          !q ||
          e.full_name.toLowerCase().includes(q) ||
          e.employee_code.toLowerCase().includes(q) ||
          (e.department ?? '').toLowerCase().includes(q) ||
          e.username.includes(q),
      );
  }, [data.data, search, filter]);

  const officeName = (id: string | null) => data.data?.offices.find((o) => o.id === id)?.name ?? '-';

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">Employees</h1>
        <Button onClick={() => setPanel({ mode: 'invite' })}>
          <UserPlus size={18} aria-hidden /> Onboard
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Input
            label="Search"
            placeholder="Name, ID, department or username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10"
          />
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute bottom-3.5 left-3.5 text-muted" />
        </div>
        <div role="tablist" aria-label="Status" className="inline-flex rounded-full border border-line bg-surface p-1">
          {(['active', 'offboarded'] as const).map((f) => (
            <button
              key={f}
              role="tab"
              type="button"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'min-h-9 rounded-full px-4 text-sm font-semibold',
                filter === f ? 'bg-solid text-on-solid' : 'text-muted',
              )}
            >
              {f === 'active' ? 'Active' : 'Offboarded'}
            </button>
          ))}
        </div>
      </div>

      {data.isLoading ? (
        <ListSkeleton rows={5} />
      ) : data.isError ? (
        <EmptyState title="Could not load employees" body="Check your connection and try again." />
      ) : list.length === 0 ? (
        <EmptyState
          title={search ? 'No one matches that search' : filter === 'active' ? 'No employees yet' : 'No one offboarded'}
          body={filter === 'active' && !search ? 'Onboard your first employee to send them an invite.' : undefined}
        />
      ) : (
        <Card className="relative w-full min-w-0 overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Today</th>
                <th className="px-4 py-3 font-medium">Leave left</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map((e) => (
                <tr key={e.user_id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{e.full_name}</p>
                    <p className="text-xs text-muted">
                      {e.username} · {officeName(e.office_id)}
                      {e.app_role === 'hr' ? ' · HR' : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.employee_code}</td>
                  <td className="px-4 py-3">{e.department ?? '-'}</td>
                  <td className="px-4 py-3">{e.start_date ? joined.format(new Date(`${e.start_date}T00:00:00Z`)) : '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {e.status === 'invited' ? (
                        <Chip tone="outline">Invited</Chip>
                      ) : e.status === 'offboarded' ? (
                        <Chip tone="outline">Offboarded</Chip>
                      ) : e.today ? (
                        <>
                          <StatusChip status={e.today.status} />
                          {e.today.flagged ? <Chip tone="danger">Check location</Chip> : null}
                        </>
                      ) : e.onLeave ? (
                        <Chip tone="outline">On leave</Chip>
                      ) : (
                        <span className="text-muted">Not in</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{e.annualLeft === null ? '-' : `${e.annualLeft} days`}</td>
                  <td className="px-4 py-3">
                    {e.status !== 'offboarded' ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="min-h-9 px-4" onClick={() => setPanel({ mode: 'edit', employee: e })}>
                          Edit
                        </Button>
                        {e.user_id !== profile?.user_id ? (
                          <Button variant="ghost" className="min-h-9 px-4 text-danger" onClick={() => setOffboarding(e)}>
                            Offboard
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Sheet
        open={panel !== null}
        title={panel?.mode === 'edit' ? `Edit ${panel.employee.full_name}` : 'Onboard employee'}
        onClose={() => setPanel(null)}
      >
        {panel ? (
          <EmployeeForm
            key={panel.mode === 'edit' ? panel.employee.user_id : 'new'}
            employee={panel.mode === 'edit' ? panel.employee : null}
            offices={data.data?.offices ?? []}
            onDone={() => setPanel(null)}
          />
        ) : null}
      </Sheet>

      <Sheet open={offboarding !== null} title="Offboard employee" onClose={() => setOffboarding(null)}>
        {offboarding ? <OffboardConfirm employee={offboarding} onDone={() => setOffboarding(null)} /> : null}
      </Sheet>
    </div>
  );
}

interface FormValues {
  full_name: string;
  work_email: string;
  department: string;
  office_id: string;
  start_date: string;
  annual_leave: string;
  app_role: 'employee' | 'hr';
}

function EmployeeForm({
  employee,
  offices,
  onDone,
}: {
  employee: Employee | null;
  offices: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const { client, profile } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      full_name: employee?.full_name ?? '',
      work_email: employee?.work_email ?? '',
      department: employee?.department ?? '',
      office_id: employee?.office_id ?? offices[0]?.id ?? '',
      start_date: employee?.start_date ?? localDate(new Date(), 'Asia/Singapore'),
      annual_leave: '14',
      app_role: employee?.app_role ?? 'employee',
    },
  });

  const onSubmit = async (v: FormValues) => {
    setError(null);
    if (v.full_name.trim().length < 2) return setFieldError('full_name', { message: 'Enter the full name' });
    if (!employee && !/^\S+@\S+\.\S+$/.test(v.work_email.trim())) {
      return setFieldError('work_email', { message: 'Enter a valid work email' });
    }
    const res = employee
      ? await callFunction(client, 'update-employee', {
          user_id: employee.user_id,
          full_name: v.full_name,
          department: v.department,
          office_id: v.office_id,
          start_date: v.start_date,
          app_role: v.app_role,
        })
      : await callFunction<{ username: string }>(client, 'invite-employee', {
          full_name: v.full_name,
          work_email: v.work_email,
          department: v.department,
          office_id: v.office_id,
          start_date: v.start_date,
          annual_leave: Number(v.annual_leave),
          app_role: v.app_role,
        });
    if (!res.ok) {
      setError(
        res.code === 'VALIDATION_FAILED' && !employee
          ? 'Could not send the invite. The email may already have an account.'
          : `${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`,
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
    await queryClient.invalidateQueries({ queryKey: ['people-names'] });
    toast(
      employee
        ? 'Employee updated.'
        : `Invite sent. Username: ${(res.data as { username: string }).username}`,
    );
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      <Input label="Full name" error={errors.full_name?.message} {...register('full_name')} />
      <Input
        label="Work email"
        type="email"
        disabled={!!employee}
        hint={employee ? 'The sign-in email cannot be changed here.' : 'The invite is sent here.'}
        error={errors.work_email?.message}
        {...register('work_email')}
      />
      <Input label="Department (optional)" {...register('department')} />
      <Select label="Office" options={offices.map((o) => ({ value: o.id, label: o.name }))} {...register('office_id')} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start date" type="date" {...register('start_date')} />
        {employee ? null : (
          <Input label="Annual leave (days)" type="number" min="0" max="60" step="0.5" {...register('annual_leave')} />
        )}
      </div>
      <Select
        label="Role"
        disabled={employee?.user_id === profile?.user_id}
        options={[
          { value: 'employee', label: 'Employee' },
          { value: 'hr', label: 'HR admin' },
        ]}
        {...register('app_role')}
      />
      {!employee ? (
        <p className="text-sm text-muted">A username is made from the first name and shown once the invite is sent.</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" block loading={isSubmitting}>
        {employee ? 'Save changes' : 'Send invite'}
      </Button>
    </form>
  );
}

function OffboardConfirm({ employee, onDone }: { employee: Employee; onDone: () => void }) {
  const { client } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    const res = await callFunction(client, 'offboard-employee', { user_id: employee.user_id });
    setBusy(false);
    if (!res.ok) {
      toast(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`, 'danger');
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['hr-employees'] });
    toast(`${employee.full_name} has been offboarded.`);
    onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px]">
        <span className="font-semibold">{employee.full_name}</span> will be signed out on every device straight away
        and will not be able to sign in again. Their records are kept for your retention period.
      </p>
      <Button variant="danger" block onClick={confirm} loading={busy}>
        Offboard {employee.full_name.split(' ')[0]}
      </Button>
      <Button variant="outline" block onClick={onDone}>
        Keep
      </Button>
    </div>
  );
}
