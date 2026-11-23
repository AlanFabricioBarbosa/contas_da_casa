import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToastItem {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}
const ToastCtx = createContext<(message: string, tone?: 'ok' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((l) => [...l, { id, message, tone }]);
    setTimeout(() => setItems((l) => l.filter((i) => i.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg',
              t.tone === 'error' ? 'border-danger/30 bg-danger-soft text-danger' : 'bg-card text-foreground',
            )}
          >
            {t.tone === 'error' ? <TriangleAlert className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0 text-good" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
