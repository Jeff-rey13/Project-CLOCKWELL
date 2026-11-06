'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { ERRORS, countLeaveDays, type ErrorCode } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { queryKeys, useBalances, useHolidays, useLeaveTypes, useMyLeave } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface FormValues {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day_end: boolean;
  reason: string;
}

const MAX_FILE = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function NewLeavePage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { client, profile } = useSession();
  const year = new Date().getFullYear();
  const types = useLeaveTypes();
  const balances = useBalances(year);
  const holidays = useHolidays();
  const mine = useMyLeave();
  // One id per attempt, so a retry after a network error is not recorded twice.
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: { half_day_end: false, reason: '' } });

  const [watchedType, start, end, halfDay] = useWatch({
    control,
    name: ['leave_type_id', 'start_date', 'end_date', 'half_day_end'],
  });
  const typeId = watchedType || types.data?.[0]?.id || '';
  const type = types.data?.find((t) => t.id === typeId);
  const balance = balances.data?.find((b) => b.leave_type_id === typeId);

  const days = useMemo(() => {
    if (!start || !end || end < start) return null;
    return countLeaveDays(start, end, (holidays.data ?? []).map((h) => h.date), halfDay);
  }, [start, end, halfDay, holidays.data]);

  // Pending requests of this type are held against the balance until HR decides.
  const held = (mine.data ?? [])
    .filter((r) => r.status === 'pending' && r.leave_types?.name === type?.name)
    .reduce((s, r) => s + r.days, 0);
  const available = balance ? balance.entitled - balance.used - held : 0;
  const after = days === null ? null : available - days;

  const onFile = (f: File | null) => {
    setFileError(null);
    if (f && !ALLOWED.includes(f.type)) return setFileError('Use a JPG, PNG or PDF file.');
    if (f && f.size > MAX_FILE) return setFileError('The file must be 5 MB or smaller.');
    setFile(f);
  };

  const onSubmit = async (v: FormValues) => {
    if (!profile || !type) return;
    setError(null);
    if (!v.start_date) return setFieldError('start_date', { message: 'Choose a start date' });
    if (!v.end_date) return setFieldError('end_date', { message: 'Choose an end date' });
    if (v.end_date < v.start_date) return setFieldError('end_date', { message: 'End date is before start date' });
    if (v.start_date.slice(0, 4) !== v.end_date.slice(0, 4)) {
      return setFieldError('end_date', { message: 'Leave must start and end in the same year. Send two requests.' });
    }
    if (type.requires_attachment && !file) return setFileError(`${type.name} needs a document, such as a medical certificate.`);

    let attachmentPath: string | null = null;
    if (file) {
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
      const path = `${profile.company_id}/${profile.user_id}/leave/${crypto.randomUUID()}.${ext}`;
      const up = await client.storage.from('receipts').upload(path, file, { contentType: file.type });
      if (up.error) return setError('SERVER_ERROR');
      attachmentPath = path;
    }

    const res = await callFunction<{ id: string }>(client, 'request-leave', {
      client_request_id: requestId,
      leave_type_id: type.id,
      start_date: v.start_date,
      end_date: v.end_date,
      half_day_end: v.half_day_end,
      reason: v.reason,
      attachment_path: attachmentPath,
    });
    if (!res.ok) {
      setRequestId(crypto.randomUUID());
      setError(res.code);
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.myLeave(profile.user_id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.balances(profile.user_id, year) }),
    ]);
    toast('Leave request sent to HR.');
    router.push('/requests/');
  };

  if (types.isLoading || balances.isLoading) return <ListSkeleton rows={4} />;

  return (
    <>
      <h1 className="mb-4 text-2xl">Apply for leave</h1>

      <section aria-label="Balances" className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {(balances.data ?? []).map((b) => (
          <Card key={b.leave_type_id} className="min-w-[120px] shrink-0 p-3">
            <p className="text-xl font-bold">{fmt(b.entitled - b.used)}</p>
            <p className="text-xs text-muted">{b.leave_types?.name ?? 'Leave'} left</p>
          </Card>
        ))}
      </section>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Select
          label="Type"
          options={(types.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          {...register('leave_type_id')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="From" type="date" error={errors.start_date?.message} {...register('start_date')} />
          <Input label="To" type="date" error={errors.end_date?.message} {...register('end_date')} />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--fg)]" {...register('half_day_end')} />
          Half day on the last day
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason" className="text-sm font-medium">
            Reason (optional)
          </label>
          <textarea
            id="reason"
            rows={3}
            maxLength={500}
            className="rounded-box border border-line-strong bg-surface px-3.5 py-2.5 text-base outline-none focus:border-fg"
            {...register('reason')}
          />
        </div>

        {type?.requires_attachment ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="attachment" className="text-sm font-medium">
              Document (JPG, PNG or PDF, up to 5 MB)
            </label>
            <input
              id="attachment"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              capture="environment"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line-strong file:bg-surface file:px-4 file:font-semibold"
            />
            {fileError ? <p className="text-sm text-danger">{fileError}</p> : null}
          </div>
        ) : null}

        <Card className="grid grid-cols-2 gap-y-1 text-sm">
          <span className="text-muted">Working days</span>
          <span className="text-right font-semibold">{days === null ? '-' : fmt(days)}</span>
          <span className="text-muted">Balance after</span>
          <span className={`text-right font-semibold ${after !== null && after < 0 ? 'text-danger' : ''}`}>
            {after === null ? '-' : fmt(after)}
          </span>
          {held > 0 ? (
            <span className="col-span-2 text-xs text-muted">Includes {fmt(held)} days waiting for HR.</span>
          ) : null}
        </Card>

        {error ? (
          <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
            {ERRORS[error].message} {ERRORS[error].nextStep}
          </p>
        ) : null}

        <Button type="submit" block loading={isSubmitting} disabled={days !== null && days <= 0}>
          Send request
        </Button>
      </form>
    </>
  );
}
