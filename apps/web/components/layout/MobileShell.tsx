'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, CalendarCheck, Tray, UserCircle } from '@phosphor-icons/react';
import { ClockQueueSync } from '@/components/ClockQueueSync';
import { OfflineBanner } from '@/components/OfflineBanner';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/home/', label: 'Home', Icon: House },
  { href: '/attendance/', label: 'Attendance', Icon: CalendarCheck },
  { href: '/requests/', label: 'Requests', Icon: Tray },
  { href: '/profile/', label: 'Profile', Icon: UserCircle },
];

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-bg">
      <main className="flex-1 px-4 pt-5 pb-28">
        <OfflineBanner />
        {children}
      </main>
      <ClockQueueSync />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname === href.slice(0, -1);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                    active ? 'text-fg' : 'text-muted',
                  )}
                >
                  <Icon size={24} weight={active ? 'fill' : 'regular'} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
