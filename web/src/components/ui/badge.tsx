import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'danger' | 'warn' | 'good' | 'primary';
const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  good: 'bg-good-soft text-good',
  primary: 'bg-accent text-accent-foreground',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}
      {...props}
    />
  );
}
