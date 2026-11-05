'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LockSimple } from '@phosphor-icons/react';
import { ERRORS, PRODUCT_NAME, loginSchema } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { currentCompanySlug } from '@/lib/company';
import { demoCompany } from '@/lib/demo-data';

const formSchema = loginSchema.pick({ username: true, password: true });
type FormValues = z.infer<typeof formSchema>;

/** Preview build only: seed usernames. Real sign-in goes through `username-login` (task 1.6). */
const PREVIEW_USERS: Record<string, string> = { aisyah: '/home/', meiling: '/hr/dashboard/' };

const noopSubscribe = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const slug = useSyncExternalStore(noopSubscribe, currentCompanySlug, () => demoCompany.slug);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const target = PREVIEW_USERS[values.username.toLowerCase()];
    if (!target) {
      setFormError(`${ERRORS.INVALID_CREDENTIALS.message} ${ERRORS.INVALID_CREDENTIALS.nextStep}`);
      return;
    }
    router.push(target);
  };

  const companyName = slug === demoCompany.slug ? demoCompany.name : slug;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col px-5 py-10">
      <div className="flex flex-col items-center gap-3 pt-6 pb-8 text-center">
        <div
          aria-hidden
          className="flex size-16 items-center justify-center rounded-card bg-solid text-2xl font-bold text-on-solid"
        >
          {companyName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl">{companyName}</h1>
          <p className="font-mono text-xs text-muted">{slug}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          error={errors.username?.message}
          {...register('username')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        {formError ? (
          <p role="alert" className="rounded-box bg-danger-soft px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <Button type="submit" block loading={isSubmitting}>
          Sign in
        </Button>
        <div className="flex justify-between text-sm">
          <a href="#forgot" className="font-medium underline underline-offset-4">
            Forgot password?
          </a>
          <a href="#company" className="text-muted underline underline-offset-4">
            Not your company?
          </a>
        </div>
      </form>

      <div className="mt-auto flex flex-col items-center gap-2 pt-10 text-center text-xs text-muted">
        <p className="flex items-center gap-1.5">
          <LockSimple size={14} aria-hidden />
          Your location is used only when you clock in or out.
        </p>
        <p>Powered by {PRODUCT_NAME}</p>
      </div>
    </main>
  );
}
