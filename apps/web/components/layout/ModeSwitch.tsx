import Link from 'next/link';
import { cn } from '@/lib/cn';

/** Me / HR switch, shown to HR users only. */
export function ModeSwitch({ mode }: { mode: 'me' | 'hr' }) {
  const item = (active: boolean) =>
    cn(
      'flex min-h-9 items-center rounded-full px-4 text-sm font-semibold',
      active ? 'bg-solid text-on-solid' : 'text-muted',
    );
  return (
    <nav aria-label="Mode" className="inline-flex rounded-full border border-line bg-surface p-1">
      <Link href="/home/" aria-current={mode === 'me' ? 'page' : undefined} className={item(mode === 'me')}>
        Me
      </Link>
      <Link href="/hr/dashboard/" aria-current={mode === 'hr' ? 'page' : undefined} className={item(mode === 'hr')}>
        HR
      </Link>
    </nav>
  );
}
