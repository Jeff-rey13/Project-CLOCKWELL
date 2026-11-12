'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Airplane,
  Buildings,
  CalendarCheck,
  CheckSquare,
  FirstAidKit,
  GearSix,
  SquaresFour,
  Users,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { PRODUCT_NAME } from '@app/shared';
import { ModeSwitch } from '@/components/layout/ModeSwitch';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  Icon: PhosphorIcon;
}

const DESKTOP: NavItem[] = [
  { href: '/hr/dashboard/', label: 'Dashboard', Icon: SquaresFour },
  { href: '/hr/approvals/', label: 'Approvals', Icon: CheckSquare },
  { href: '/hr/leave/', label: 'Leave', Icon: Airplane },
  { href: '/hr/claims/', label: 'Claims', Icon: FirstAidKit },
  { href: '/hr/employees/', label: 'Employees', Icon: Users },
  { href: '/hr/attendance/', label: 'Attendance', Icon: CalendarCheck },
  { href: '/hr/offices/', label: 'Offices and rules', Icon: Buildings },
  { href: '/hr/settings/', label: 'Company settings', Icon: GearSix },
];

/** HR mobile layout (PRD screen 13): Today, Approvals, People, Offices. */
const MOBILE: NavItem[] = [
  { href: '/hr/dashboard/', label: 'Today', Icon: SquaresFour },
  { href: '/hr/approvals/', label: 'Approvals', Icon: CheckSquare },
  { href: '/hr/employees/', label: 'People', Icon: Users },
  { href: '/hr/offices/', label: 'Offices', Icon: Buildings },
];

const MOBILE_MORE: NavItem[] = [
  { href: '/hr/attendance/', label: 'Attendance', Icon: CalendarCheck },
  { href: '/hr/settings/', label: 'Settings', Icon: GearSix },
];

export function WebShell({ companyName, children }: { companyName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href.slice(0, -1));

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-surface p-4 lg:flex lg:flex-col lg:gap-6">
        <div>
          <p className="text-base font-bold">{companyName}</p>
          <p className="text-xs text-muted">HR</p>
        </div>
        <nav aria-label="HR">
          <ul className="flex flex-col gap-1">
            {DESKTOP.map(({ href, label, Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={isActive(href) ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-medium',
                    isActive(href) ? 'bg-solid text-on-solid' : 'text-fg hover:bg-soft',
                  )}
                >
                  <Icon size={20} aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-auto text-xs text-muted">Powered by {PRODUCT_NAME}</p>
      </aside>

      <main className="min-w-0 px-4 pt-5 pb-28 lg:px-8 lg:pt-6 lg:pb-6">
        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
          <div className="min-w-0">
            <p className="truncate font-bold">{companyName}</p>
            <nav aria-label="More HR sections" className="flex gap-3 text-sm">
              {MOBILE_MORE.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(href) ? 'page' : undefined}
                  className={cn('min-h-9 py-1 underline-offset-4', isActive(href) ? 'font-semibold underline' : 'text-muted')}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
          <ModeSwitch mode="hr" />
        </div>
        {children}
      </main>

      <nav
        aria-label="HR"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {MOBILE.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  isActive(href) ? 'text-fg' : 'text-muted',
                )}
              >
                <Icon size={24} weight={isActive(href) ? 'fill' : 'regular'} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
