import { createContext, useContext, useState, type ReactNode } from 'react';
import { currentMonth } from './format';
import type { User } from './types';

interface AppCtx {
  user: User;
  month: string;
  setMonth: (m: string) => void;
  openExpenseForm: () => void;
}
const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do provider');
  return v;
}

export function AppProvider({ user, openExpenseForm, children }: { user: User; openExpenseForm: () => void; children: ReactNode }) {
  const [month, setMonthState] = useState(() => sessionStorage.getItem('mes') ?? currentMonth());
  const setMonth = (m: string) => {
    setMonthState(m);
    sessionStorage.setItem('mes', m);
  };
  return <Ctx.Provider value={{ user, month, setMonth, openExpenseForm }}>{children}</Ctx.Provider>;
}
