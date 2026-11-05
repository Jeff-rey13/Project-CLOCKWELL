import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'solid' | 'outline' | 'ghost' | 'danger' | 'inverse';

const variants: Record<Variant, string> = {
  solid: 'bg-solid text-on-solid hover:opacity-90',
  outline: 'border border-line-strong bg-surface text-fg hover:bg-soft',
  ghost: 'text-fg hover:bg-soft',
  danger: 'bg-danger text-white hover:opacity-90',
  inverse: 'bg-on-solid text-solid hover:opacity-90',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  block?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'solid', block, loading, className, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        block && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? 'Please wait' : children}
    </button>
  );
});
