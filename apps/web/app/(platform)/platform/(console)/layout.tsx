'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { PRODUCT_NAME } from '@app/shared';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/cn';

const REQUIRE_MFA = process.env.NEXT_PUBLIC_REQUIRE_HR_MFA === 'true';

/** Platform console: vendor team only, two-step sign-in when required. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, platformRole, client } = useSession();
  const [mfaOk, setMfaOk] = useState(!REQUIRE_MFA);

  useEffect(() => {
    if (status === 'signed_out' || (status === 'signed_in' && !platformRole)) router.replace('/platform/login/');
  }, [status, platformRole, router]);

  useEffect(() => {
    if (mfaOk || status !== 'signed_in' || !platformRole) return;
    void client.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.currentLevel === 'aal2') setMfaOk(true);
      else router.replace('/two-step/?next=/platform/companies/');
    });
  }, [mfaOk, status, platformRole, client, router]);

  if (status !== 'signed_in' || !platformRole || !mfaOk) {
    return (
      <div className="mx-auto max-w-5xl px-4 pt-8">
        <ListSkeleton rows={4} />
      </div>
    );
  }

  const signOut = async () => {
    await client.auth.signOut({ scope: 'local' });
    window.location.assign('/platform/login/');
  };

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="font-bold">{PRODUCT_NAME} platform</span>
            <nav aria-label="Platform" className="flex gap-1">
              {[
                { href: '/platform/companies/', label: 'Companies', match: ['/platform/compan', '/platform/support'] },
                { href: '/platform/flags/', label: 'Flags', match: ['/platform/flags'] },
              ].map((n) => {
                const active = n.match.some((m) => pathname.startsWith(m));
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center rounded-full px-3 text-sm font-medium',
                      active ? 'bg-solid text-on-solid' : 'hover:bg-soft',
                    )}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted capitalize">{platformRole}</span>
            <button type="button" onClick={signOut} className="min-h-10 font-medium underline underline-offset-4">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
