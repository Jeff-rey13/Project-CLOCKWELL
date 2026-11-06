'use client';

import { Guard } from '@/components/layout/Guard';
import { WebShell } from '@/components/layout/WebShell';
import { useSession } from '@/lib/session';

function Shell({ children }: { children: React.ReactNode }) {
  const { companyName } = useSession();
  return <WebShell companyName={companyName}>{children}</WebShell>;
}

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard role="hr">
      <Shell>{children}</Shell>
    </Guard>
  );
}
