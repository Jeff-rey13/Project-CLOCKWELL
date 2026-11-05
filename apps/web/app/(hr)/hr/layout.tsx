import { WebShell } from '@/components/layout/WebShell';
import { demoCompany } from '@/lib/demo-data';

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return <WebShell companyName={demoCompany.name}>{children}</WebShell>;
}
