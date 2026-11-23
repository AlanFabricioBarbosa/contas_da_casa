import { cn } from '@/lib/utils';

export function Footer({ className }: { className?: string }) {
  return (
    <footer className={cn('mt-8 border-t border-border/60 pt-4 text-center text-xs text-muted-foreground', className)}>
      <span>Feito por Alan Fabrício</span>
      <span aria-hidden> · </span>
      <a
        href="https://www.linkedin.com/in/alanfabriciodev/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-primary hover:underline"
      >
        LinkedIn
      </a>
      <span aria-hidden> · </span>
      <span className="tabular opacity-75">{__APP_VERSION__}</span>
    </footer>
  );
}
