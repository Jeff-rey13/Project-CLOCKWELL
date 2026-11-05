'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SquaresFour,
  Users,
  CalendarCheck,
  Buildings,
  GearSix,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { PRODUCT_NAME } from '@app/shared';
import { cn } from '@/lib/cn';

const NAV: Array<{ href: string; label: string; Icon: PhosphorIcon; ready: boolean }> = [
  { href: '/hr/dashboard/', label: 'Dashboard', Icon: SquaresFour, ready: true },
  { href: '/hr/employees/', label: 'Employees', Icon: Users, ready: false },
  { href: '/hr/attendance/', label: 'Attendance', Icon: CalendarCheck, ready: false },
  { href: '/hr/offices/', label: 'Offices and rules', Icon: Buildings, ready: false },
  { href: '/hr/settings/', label: 'Company settings', Icon: GearSix, ready: false },
];

export function WebShell({ companyName, children }: { companyName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-surface p-4 lg:flex lg:flex-col lg:gap-6">
        <div>
          <p className="text-base font-bold">{companyName}</p>
          <p className="text-xs text-muted">HR</p>
        </div>
        <nav aria-label="HR">
          <ul className="flex flex-col gap-1">
            {NAV.map(({ href, label, Icon, ready }) => {
              const active = pathname.startsWith(href.slice(0, -1));
              if (!ready) {
                return (
                  <li key={href}>
                    <span
                      aria-disabled
                      className="flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-medium text-muted"
                    >
                      <Icon size={20} aria-hidden />
                      {label}
                      <span className="ml-auto text-xs">Soon</span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-medium',
                      active ? 'bg-solid text-on-solid' : 'text-fg hover:bg-soft',
                    )}
                  >
                    <Icon size={20} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="mt-auto text-xs text-muted">Powered by {PRODUCT_NAME}</p>
      </aside>
      <main className="px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
