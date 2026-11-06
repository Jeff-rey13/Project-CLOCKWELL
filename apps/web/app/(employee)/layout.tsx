import { Guard } from '@/components/layout/Guard';
import { MobileShell } from '@/components/layout/MobileShell';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return (
    <Guard role="any">
      <MobileShell>{children}</MobileShell>
    </Guard>
  );
}
