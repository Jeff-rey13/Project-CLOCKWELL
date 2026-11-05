import Link from 'next/link';
import { PRODUCT_NAME } from '@app/shared';
import { PreviewNote } from '@/components/layout/PreviewNote';
import { Card } from '@/components/ui/Card';
import { demoCompany, demoUser } from '@/lib/demo-data';

export default function ProfilePage() {
  const rows: Array<[string, string]> = [
    ['Name', demoUser.fullName],
    ['Employee ID', demoUser.employeeCode],
    ['Department', demoUser.department],
    ['Office', demoUser.office],
    ['Company', demoCompany.name],
  ];
  return (
    <>
      <PreviewNote />
      <h1 className="mb-4 text-2xl">Profile</h1>
      <Card className="mb-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className={k === 'Employee ID' ? 'text-right font-mono' : 'text-right'}>{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Link
        href="/login/"
        className="flex min-h-11 w-full items-center justify-center rounded-full border border-line-strong bg-surface text-[15px] font-semibold"
      >
        Sign out
      </Link>
      <p className="mt-6 text-center text-xs text-muted">Powered by {PRODUCT_NAME}</p>
    </>
  );
}
