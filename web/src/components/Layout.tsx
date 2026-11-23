import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, PiggyBank, Plus, Receipt, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/lib/theme';
import { AppProvider, useApp } from '@/lib/app-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { resetSession } from '@/lib/session';
import type { User } from '@/lib/types';
import { MonthPicker } from './MonthPicker';
import { DemoBanner } from './DemoBanner';
import { ClaimDialog } from './ClaimDialog';
import { ExpenseDialog } from './ExpenseDialog';
import DashboardPage from '@/pages/DashboardPage';
import ExpensesPage from '@/pages/ExpensesPage';
import MembersPage from '@/pages/MembersPage';
import ReservesPage from '@/pages/ReservesPage';

const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/gastos', label: 'Gastos', icon: Receipt },
  { to: '/reservas', label: 'Reservas', icon: PiggyBank },
  { to: '/pessoas', label: 'Pessoas', icon: Users },
];

export default function Layout({ user }: { user: User }) {
  const [expenseOpen, setExpenseOpen] = useState(false);
  return (
    <AppProvider user={user} openExpenseForm={() => setExpenseOpen(true)}>
      <Shell />
      <ExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </AppProvider>
  );
}

function Shell() {
  const { user, month, setMonth, openExpenseForm } = useApp();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const [claim, setClaim] = useState(false);
  const showMonth = pathname === '/' || pathname.startsWith('/gastos');

  const logout = async () => {
    await api.logout();
    resetSession(qc, null);
  };

  return (
    <div className="min-h-dvh pb-24 md:pb-8">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2 font-bold">
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-sm text-primary-foreground" aria-hidden>
              R$
            </span>
            <span className="hidden sm:inline">Contas da Casa</span>
          </div>

          <nav aria-label="Principal" className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted')
                }
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Button onClick={openExpenseForm} className="hidden md:inline-flex">
              <Plus className="size-4" /> Novo gasto
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sair" title={`Sair (${user.name})`}>
              <LogOut className="size-5" />
            </Button>
          </div>
        </div>
        {showMonth && (
          <div className="mx-auto max-w-6xl px-4 pb-2.5">
            <MonthPicker month={month} onChange={setMonth} />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 pb-28 sm:py-6 md:pb-6">
        <DemoBanner user={user} onClaim={() => setClaim(true)} />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/gastos" element={<ExpensesPage />} />
          <Route path="/reservas" element={<ReservesPage />} />
          <Route path="/pessoas" element={<MembersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Botão rápido de novo gasto (celular) */}
      {(pathname === '/' || pathname.startsWith('/gastos')) && (
        <Button onClick={openExpenseForm} size="lg" className="fixed bottom-20 right-4 z-30 rounded-full shadow-lg md:hidden" aria-label="Novo gasto">
          <Plus className="size-5" /> Gasto
        </Button>
      )}

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium', isActive ? 'text-primary' : 'text-muted-foreground')
                }
              >
                <n.icon className="size-6" aria-hidden />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <ClaimDialog open={claim} onClose={() => setClaim(false)} />
    </div>
  );
}
