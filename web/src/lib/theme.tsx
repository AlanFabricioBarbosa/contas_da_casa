import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Theme = 'claro' | 'escuro';
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'claro', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'escuro');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'escuro' ? '#0b1a1f' : '#0f766e');
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'escuro' ? 'claro' : 'escuro';
      try {
        localStorage.setItem('tema', next);
      } catch {
        /* sem armazenamento: tudo bem */
      }
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const toDark = theme === 'claro';
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={toDark ? 'Ativar modo escuro' : 'Ativar modo claro'} title={toDark ? 'Modo escuro' : 'Modo claro'}>
      {toDark ? <Moon className="size-5" /> : <Sun className="size-5" />}
    </Button>
  );
}
