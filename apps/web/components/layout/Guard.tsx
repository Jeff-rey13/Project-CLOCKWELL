'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from '@phosphor-icons/react';
import { PRODUCT_NAME } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/lib/session';

/** Sends signed-out users to login and non-HR users away from HR pages. */
const REQUIRE_HR_MFA = process.env.NEXT_PUBLIC_REQUIRE_HR_MFA === 'true';

export function Guard({ role, children }: { role: 'any' | 'hr'; children: React.ReactNode }) {
  const router = useRouter();
  const { status, profile, platformRole, client } = useSession();
  // HR pages need two-step sign-in (AAL2) when required. Employee pages do not.
  const [mfaOk, setMfaOk] = useState(!(role === 'hr' && REQUIRE_HR_MFA));

  useEffect(() => {
    if (status === 'signed_out') router.replace('/login/');
    else if (status === 'signed_in' && !profile && platformRole) router.replace('/platform/companies/');
    else if (status === 'signed_in' && role === 'hr' && profile?.app_role !== 'hr') router.replace('/home/');
  }, [status, profile, platformRole, role, router]);

  useEffect(() => {
    if (mfaOk || status !== 'signed_in' || profile?.app_role !== 'hr') return;
    void client.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.currentLevel === 'aal2') setMfaOk(true);
      else router.replace('/two-step/');
    });
  }, [mfaOk, status, profile, client, router]);

  if (status !== 'signed_in' || !profile || (role === 'hr' && profile.app_role !== 'hr') || !mfaOk) {
    return (
      <div className="mx-auto max-w-[480px] px-4 pt-8">
        <ListSkeleton rows={3} />
      </div>
    );
  }
  if (!profile.privacy_ack_at) return <PrivacyNotice />;
  return <>{children}</>;
}

/** Shown once on first sign-in. The acknowledgement is stored with a timestamp (PDPA). */
function PrivacyNotice() {
  const { client, reloadProfile, companyName } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    const { error } = await client.rpc('acknowledge_privacy');
    setBusy(false);
    if (error) {
      toast('Something went wrong on our side. Try again in a moment.', 'danger');
      return;
    }
    await reloadProfile();
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-5 px-5 py-10">
      <ShieldCheck size={36} aria-hidden />
      <h1 className="text-2xl">How your data is used</h1>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed">
        <p>
          {companyName} uses {PRODUCT_NAME} to record attendance, leave and medical claims.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Your location is read only when you clock in or clock out. It is never tracked in the background.</li>
          <li>Your clock-in selfie is stored for your HR team to check, then deleted after the period your company sets.</li>
          <li>No face templates or biometric data are kept. Times are recorded by the server.</li>
          <li>Only you and your HR team can see your records.</li>
        </ul>
        <p className="text-sm text-muted">You can ask your HR team for a copy of your data at any time.</p>
      </div>
      <Button block onClick={accept} loading={busy} className="mt-auto">
        I understand
      </Button>
    </main>
  );
}
