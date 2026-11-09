'use client';

import { useState } from 'react';
import { PRODUCT_NAME } from '@app/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HomeLocationCard } from '@/components/HomeLocationCard';
import { useSession } from '@/lib/session';

export default function ProfilePage() {
  const { profile, companyName, client } = useSession();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const rows: Array<[string, string, boolean]> = [
    ['Name', profile.full_name, false],
    ['Employee ID', profile.employee_code, true],
    ['Department', profile.department ?? '-', false],
    ['Role', profile.app_role === 'hr' ? 'HR' : 'Employee', false],
    ['Company', companyName, false],
  ];

  const signOut = async () => {
    setBusy(true);
    // Signs out this device only. Offboarding revokes every session server side.
    await client.auth.signOut({ scope: 'local' });
    try {
      window.sessionStorage.removeItem('company-target');
    } catch {
      // ignore
    }
    window.location.assign('/login/');
  };

  return (
    <>
      <h1 className="mb-4 text-2xl">Profile</h1>
      <Card className="mb-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v, mono]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className={mono ? 'text-right font-mono' : 'text-right'}>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <HomeLocationCard />
      <Card className="mb-4 text-sm">
        <p className="mb-1 font-semibold">Privacy</p>
        <p className="text-muted">
          Location is read only when you clock in or out, or register your home. Selfies are deleted after your company&apos;s
          retention period. No biometric data is stored.
        </p>
      </Card>
      <Button block variant="outline" onClick={signOut} loading={busy}>
        Sign out
      </Button>
      <p className="mt-6 text-center text-xs text-muted">Powered by {PRODUCT_NAME}</p>
    </>
  );
}
