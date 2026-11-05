import { MobileShell } from '@/components/layout/MobileShell';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <MobileShell>{children}</MobileShell>;
}
