import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

/**
 * Diálogo baseado no <dialog> nativo: foco preso, Esc fecha, clique fora fecha (closedby="any")
 * e, no celular, aparece como folha na parte de baixo da tela.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const closedBy = { closedby: 'any' } as Record<string, string>;

  return (
    <dialog
      ref={ref}
      className={cn('sheet open:flex open:flex-col')}
      style={wide ? ({ '--dialog-w': '40rem' } as React.CSSProperties) : undefined}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // alternativa ao closedby para navegadores mais antigos: clique no fundo escuro
        if (e.target === ref.current) onClose();
      }}
      {...closedBy}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold leading-tight">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar" className="-mr-2 -mt-1 shrink-0">
              <X className="size-5" />
            </Button>
          </div>
          <div className="overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
        </>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  busy,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant={danger ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Aguarde…' : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
