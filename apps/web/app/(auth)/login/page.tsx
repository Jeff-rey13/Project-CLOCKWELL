'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LockSimple, PauseCircle } from '@phosphor-icons/react';
import { ERRORS, PRODUCT_NAME, companySlug, loginSchema } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { callFunction } from '@/lib/api';
import { companyClient, rememberCompany, resolveCompany, type ResolvedCompany } from '@/lib/supabase';
import { useSession } from '@/lib/session';

const formSchema = loginSchema.pick({ username: true, password: true });
type FormValues = z.infer<typeof formSchema>;

interface Tokens {
  access_token: string;
  refresh_token: string;
}

function roleFromToken(token: string): string | null {
  try {
    const part = token.split('.')[1] ?? '';
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { app_role?: string };
    return json.app_role ?? null;
  } catch {
    return null;
  }
}

type Lookup =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error' }
  | { state: 'ready'; company: ResolvedCompany };

export default function LoginPage() {
  const { slug, status, profile } = useSession();
  const [lookup, setLookup] = useState<Lookup>({ state: 'loading' });
  const [formError, setFormError] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'forgot' | 'company'>('none');
  const [otherCompany, setOtherCompany] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    let active = true;
    resolveCompany(slug)
      .then((c) => active && setLookup(c ? { state: 'ready', company: c } : { state: 'missing' }))
      .catch(() => active && setLookup({ state: 'error' }));
    return () => {
      active = false;
    };
  }, [slug]);

  // Already signed in: go straight in.
  useEffect(() => {
    if (status === 'signed_in') {
      window.location.replace(profile?.app_role === 'hr' ? '/hr/dashboard/' : '/home/');
    }
  }, [status, profile]);

  const onSubmit = async (values: FormValues) => {
    if (lookup.state !== 'ready') return;
    setFormError(null);
    const client = companyClient(slug, lookup.company);
    const res = await callFunction<Tokens>(client, 'username-login', { slug, ...values });
    if (!res.ok) {
      setFormError(`${ERRORS[res.code].message} ${ERRORS[res.code].nextStep}`);
      return;
    }
    const { error } = await client.auth.setSession(res.data);
    if (error) {
      setFormError(`${ERRORS.SERVER_ERROR.message} ${ERRORS.SERVER_ERROR.nextStep}`);
      return;
    }
    rememberCompany(slug, lookup.company);
    window.location.assign(roleFromToken(res.data.access_token) === 'hr' ? '/hr/dashboard/' : '/home/');
  };

  const goToCompany = () => {
    const parsed = companySlug.safeParse(otherCompany.trim().toLowerCase());
    if (!parsed.success) return;
    try {
      window.sessionStorage.clear();
    } catch {
      // ignore
    }
    window.location.assign(`/login/?company=${parsed.data}`);
  };

  if (lookup.state === 'ready' && (lookup.company.status === 'suspended' || lookup.company.status === 'pending_deletion')) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center gap-3 px-5 text-center">
        <PauseCircle size={40} aria-hidden />
        <h1 className="text-2xl">This account is paused</h1>
        <p className="text-muted">{ERRORS.COMPANY_SUSPENDED.nextStep}</p>
      </main>
    );
  }

  const companyName = lookup.state === 'ready' ? lookup.company.name : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col px-5 py-10">
      <div className="flex flex-col items-center gap-3 pt-6 pb-8 text-center">
        {lookup.state === 'loading' ? (
          <>
            <Skeleton className="size-16" />
            <Skeleton className="h-7 w-48" />
          </>
        ) : companyName ? (
          <>
            {lookup.state === 'ready' && lookup.company.logo_url ? (
              // Company logo from the public logos bucket.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${process.env.NEXT_PUBLIC_SHARED_SUPABASE_URL ?? ''}/storage/v1/object/public/logos/${lookup.company.logo_url}`}
                alt=""
                className="size-16 rounded-card border border-line bg-white object-contain p-1"
              />
            ) : (
              <div
                aria-hidden
                className="flex size-16 items-center justify-center rounded-card bg-solid text-2xl font-bold text-on-solid"
              >
                {companyName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl">{companyName}</h1>
              <p className="font-mono text-xs text-muted">{slug}</p>
            </div>
          </>
        ) : (
          <div>
            <h1 className="text-2xl">Company not found</h1>
            <p className="text-sm text-muted">
              {lookup.state === 'error'
                ? `${ERRORS.SERVER_ERROR.message} ${ERRORS.SERVER_ERROR.nextStep}`
                : 'Check the address you were given, or enter your company code below.'}
            </p>
          </div>
        )}
      </div>

      {companyName ? (
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
        </form>
      ) : null}

      <div className="mt-4 flex justify-between text-sm">
        <button type="button" onClick={() => setPanel('forgot')} className="min-h-11 font-medium underline underline-offset-4">
          Forgot password?
        </button>
        <button type="button" onClick={() => setPanel('company')} className="min-h-11 text-muted underline underline-offset-4">
          Not your company?
        </button>
      </div>

      {panel === 'forgot' ? (
        <p className="rounded-box border border-line bg-surface px-3 py-3 text-sm">
          Ask your HR team to reset your password. They can send you a new sign-in link.
        </p>
      ) : null}
      {panel === 'company' ? (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Company code"
              hint="The first part of your sign-in address"
              autoCapitalize="none"
              value={otherCompany}
              onChange={(e) => setOtherCompany(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" onClick={goToCompany} className="mb-6">
            Go
          </Button>
        </div>
      ) : null}

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
