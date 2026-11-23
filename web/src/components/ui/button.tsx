import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'danger-ghost';
type Size = 'default' | 'sm' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm',
  secondary: 'bg-accent text-accent-foreground hover:opacity-90',
  outline: 'border border-input bg-card hover:bg-muted',
  ghost: 'hover:bg-muted',
  destructive: 'bg-destructive text-white hover:opacity-90',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
};
const sizes: Record<Size, string> = {
  default: 'h-11 px-4 text-sm',
  sm: 'h-9 px-3 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'h-10 w-10',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors',
        'disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
