import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { numFmt } from '@/lib/format';

const controlBase =
  'w-full rounded-lg border border-input bg-card px-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/70 ' +
  'h-11 transition-colors focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:border-ring disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(controlBase, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(controlBase, 'ui-select cursor-pointer pr-2', className)} {...props} />;
});

/** Campo com rótulo (e dica/erro) ligados por id — acessível para leitores de tela. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {(error || hint) && (
        <p id={describedBy} className={cn('text-xs', error ? 'text-danger' : 'text-muted-foreground')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/** Valor em reais: o usuário digita só números e a vírgula "anda" (1 → 0,01 · 150 → 1,50). */
export function CurrencyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">R$</span>
      <input
        inputMode="numeric"
        autoComplete="off"
        placeholder="0,00"
        className={cn(controlBase, 'pl-10 tabular text-right', className)}
        value={value > 0 ? numFmt(value) : ''}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
          onChange(digits ? Number(digits) / 100 : 0);
        }}
        {...props}
      />
    </div>
  );
}

/** Opções em botões grandes (melhor no celular que um <select>). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'cursor-pointer rounded-lg border px-2 py-2 text-center text-sm font-medium transition-colors min-h-11',
              active ? 'border-primary bg-accent text-accent-foreground ring-1 ring-primary' : 'border-input bg-card hover:bg-muted',
            )}
          >
            {o.label}
            {o.description && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{o.description}</span>}
          </button>
        );
      })}
    </div>
  );
}
