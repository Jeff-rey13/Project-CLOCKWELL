'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ERRORS, PRODUCT_NAME } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useSession } from '@/lib/session';

interface FormValues {
  email: string;
  password: string;
}

/** Sign-in for the vendor team. Company staff sign in on their company address instead. */
export default function PlatformLoginPage() {
  const { client, status, platformRole } = useSession();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<FormValues>();

  useEffect(() => {
    if (status === 'signed_in' && platformRole) window.location.replace('/platform/companies/');
  }, [status, platformRole]);

  const onSubmit = async (v: FormValues) => {
    setError(null);
    const generic = `${ERRORS.INVALID_CREDENTIALS.message} ${ERRORS.INVALID_CREDENTIALS.nextStep}`;
    const { error: e } = await client.auth.signInWithPassword({ email: v.email.trim(), password: v.password });
    if (e) return setError(e.status === 429 ? ERRORS.RATE_LIMITED.message : generic);
    const { data: role } = await client.rpc('my_platform_role');
    if (!role) {
      await client.auth.signOut({ scope: 'local' });
      return setError(generic);
    }
    window.location.assign('/platform/companies/');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-6 px-5 py-10">
      <div>
        <p className="font-mono text-xs text-muted">platform</p>
        <h1 className="text-2xl">{PRODUCT_NAME} platform</h1>
        <p className="text-sm text-muted">For the {PRODUCT_NAME} team only.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input label="Email" type="email" autoComplete="username" {...register('email')} />
        <Input label="Password" type="password" autoComplete="current-password" {...register('password')} />
        {error ? (
          <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" block loading={isSubmitting}>
          Sign in
        </Button>
      </form>
    </main>
  );
}
