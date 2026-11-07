'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { ERRORS, claimRemaining, type ErrorCode } from '@app/shared';
import { FilePicker, fileExtension } from '@/components/FilePicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { callFunction } from '@/lib/api';
import { localDate, money, queryKeys, useClaimPolicy, useMyClaims } from '@/lib/queries';
import { useSession } from '@/lib/session';

interface FormValues {
  clinic: string;
  visit_date: string;
  amount: string;
}

export default function NewClaimPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { client, profile } = useSession();
  const year = new Date().getFullYear();
  const policy = useClaimPolicy(year);
  const claims = useMyClaims();
  const [requestId, setRequestId] = useState<string>(() => crypto.randomUUID());
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const today = localDate(new Date(), 'Asia/Singapore');

  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  const thisYear = (claims.data ?? []).filter((c) => c.visit_date.startsWith(String(year)));
  const sum = (s: string) => thisYear.filter((c) => c.status === s).reduce((t, c) => t + c.amount, 0);
  const remaining = policy.data
    ? claimRemaining({ ...policy.data, approvedThisYear: sum('approved'), pendingThisYear: sum('pending') })
    : null;

  const onSubmit = async (v: FormValues) => {
    if (!profile) return;
    setError(null);
    const amount = Number(v.amount);
    if (!v.clinic.trim()) return setFieldError('clinic', { message: 'Enter the clinic name' });
    if (!v.visit_date) return setFieldError('visit_date', { message: 'Choose the visit date' });
    if (v.visit_date > today) return setFieldError('visit_date', { message: 'The visit date cannot be in the future' });
    if (!(amount > 0)) return setFieldError('amount', { message: 'Enter an amount above zero' });
    if (Math.round(amount * 100) !== amount * 100) return setFieldError('amount', { message: 'Use at most 2 decimal places' });
    if (files.length === 0) return setFileError('Add a photo or PDF of the receipt.');

    const paths: string[] = [];
    for (const f of files) {
      const path = `${profile.company_id}/${profile.user_id}/${requestId}/${crypto.randomUUID()}.${fileExtension(f)}`;
      const up = await client.storage.from('receipts').upload(path, f, { contentType: f.type });
      if (up.error) return setError('SERVER_ERROR');
      paths.push(path);
    }

    const res = await callFunction(client, 'submit-claim', {
      client_request_id: requestId,
      clinic: v.clinic.trim(),
      visit_date: v.visit_date,
      amount,
      receipt_paths: paths,
    });
    if (!res.ok) {
      setRequestId(crypto.randomUUID());
      setError(res.code);
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.myClaims(profile.user_id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.claimsPending(profile.user_id) }),
    ]);
    toast('Claim sent to HR.');
    router.push('/requests/');
  };

  if (policy.isLoading || claims.isLoading) return <ListSkeleton rows={4} />;

  return (
    <>
      <h1 className="mb-4 text-2xl">Medical claim</h1>
      <Card className="mb-5">
        {policy.data ? (
          <>
            <p className="text-2xl font-bold">{money(remaining ?? 0)}</p>
            <p className="text-sm text-muted">
              Left to claim in {year}
              {policy.data.perClaimLimit !== null ? `. Up to ${money(policy.data.perClaimLimit)} per claim.` : '.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">Your company has not set a claim limit for {year} yet. Ask your HR team.</p>
        )}
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input label="Clinic" autoComplete="off" error={errors.clinic?.message} {...register('clinic')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Visit date" type="date" max={today} error={errors.visit_date?.message} {...register('visit_date')} />
          <Input
            label="Amount (SGD)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            error={errors.amount?.message}
            {...register('amount')}
          />
        </div>
        <FilePicker
          label="Receipt (photo or PDF, up to 5 MB)"
          files={files}
          error={fileError}
          onChange={(f, e) => {
            setFiles(f);
            setFileError(e);
          }}
        />
        {error ? (
          <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
            {ERRORS[error].message} {ERRORS[error].nextStep}
          </p>
        ) : null}
        <Button type="submit" block loading={isSubmitting} disabled={!policy.data}>
          Send claim
        </Button>
      </form>
    </>
  );
}
