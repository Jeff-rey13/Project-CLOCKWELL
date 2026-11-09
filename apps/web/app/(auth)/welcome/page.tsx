'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ERRORS, PRODUCT_NAME } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/session';

interface FormValues {
  password: string;
  confirm: string;
}

/**
 * Landing page of the invite email. The link signs the person in; here they choose a password,
 * see their username, then continue to the privacy notice and the app.
 */
export default function WelcomePage() {
  const { client, profile, status, companyName, reloadProfile } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [linkChecked, setLinkChecked] = useState(false);
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  // The invite link puts the session in the URL; give the client a moment to read it.
  useEffect(() => {
    const t = setTimeout(() => {
      void reloadProfile().finally(() => setLinkChecked(true));
    }, 300);
    return () => clearTimeout(t);
    // Runs once on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (v: FormValues) => {
    setError(null);
    if (v.password.length < 10) return setFieldError('password', { message: 'Use at least 10 characters' });
    if (v.password !== v.confirm) return setFieldError('confirm', { message: 'The passwords do not match' });
    const { error: e } = await client.auth.updateUser({ password: v.password });
    if (e) {
      setError(`${ERRORS.SERVER_ERROR.message} ${ERRORS.SERVER_ERROR.nextStep}`);
      return;
    }
    window.location.assign(profile?.app_role === 'hr' ? '/hr/dashboard/' : '/home/');
  };

  if (!linkChecked || status === 'loading') {
    return (
      <main className="mx-auto max-w-[420px] px-5 py-12">
        <ListSkeleton rows={3} />
      </main>
    );
  }

  if (status !== 'signed_in' || !profile) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-3 px-5 text-center">
        <h1 className="text-2xl">This link has expired</h1>
        <p className="text-muted">Ask your HR team to send a new invite.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col gap-6 px-5 py-10">
      <div>
        <p className="text-sm text-muted">{companyName}</p>
        <h1 className="text-2xl">Welcome, {profile.full_name.split(' ')[0]}</h1>
        <p className="mt-2 text-[15px]">
          Your username is <span className="font-mono font-semibold">{profile.username}</span>. Choose a password to
          finish setting up your account.
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 10 characters"
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        {error ? (
          <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" block loading={isSubmitting}>
          Save password and continue
        </Button>
      </form>
      <p className="mt-auto text-center text-xs text-muted">Powered by {PRODUCT_NAME}</p>
    </main>
  );
}
