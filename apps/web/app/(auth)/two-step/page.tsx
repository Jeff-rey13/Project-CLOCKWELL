'use client';

import { PRODUCT_NAME } from '@app/shared';
import { TwoStep } from '@/components/TwoStep';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useSession } from '@/lib/session';

/** HR pages need two-step sign-in. People are sent here when their session is not yet at that level. */
export default function TwoStepPage() {
  const { status, profile, companyName } = useSession();
  if (status !== 'signed_in' || !profile) {
    return (
      <main className="mx-auto max-w-[420px] px-5 py-12">
        <ListSkeleton rows={3} />
      </main>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col gap-6 px-5 py-10">
      <div>
        <p className="text-sm text-muted">{companyName}</p>
        <h1 className="text-2xl">Two-step sign-in</h1>
        <p className="mt-2 text-[15px] text-muted">HR pages hold personal data, so they need a second step each time you sign in.</p>
      </div>
      <TwoStep onDone={() => window.location.assign('/hr/dashboard/')} />
      <p className="mt-auto text-center text-xs text-muted">Powered by {PRODUCT_NAME}</p>
    </main>
  );
}
