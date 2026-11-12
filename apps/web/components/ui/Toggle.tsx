'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';

/** On/off switch with a visible label and an optional hint. */
export function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <label htmlFor={id} className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border transition-colors',
          checked ? 'border-fg bg-solid' : 'border-line-strong bg-soft',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-5.5 rounded-full transition-transform',
            checked ? 'translate-x-5.5 bg-on-solid' : 'translate-x-0.5 bg-surface shadow',
          )}
        />
      </button>
    </div>
  );
}
