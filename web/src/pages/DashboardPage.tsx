import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Lightbulb, PiggyBank, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/lib/app-context';
import { CATEGORY_INFO } from '@/lib/categories';
import { brlFmt, monthLabel, monthTitle, pctFmt } from '@/lib/format';
import { useSummary } from '@/lib/queries';
import type { Insight, Summary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Skeleton } from './shared';
import { QuickAdd } from '@/components/QuickAdd';

export default function DashboardPage() {
  const { month } = useApp();
  const q = useSummary(month);

  if (q.isPending) return <Skeleton />;
  if (q.error || !q.data) return <p role="alert" className="text-danger">Não foi possível carregar o painel.</p>;
  const s = q.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold sm:text-2xl">{monthTitle(month)}</h1>

      {s.members.length === 0 && (
        <Card className="border-primary/40 bg-accent p-4 text-accent-foreground">
          <p className="font-semibold">Vamos começar?</p>
          <p className="mt-1 text-sm">
            1) Cadastre quem mora na casa e quanto cada um ganha em <Link to="/pessoas" className="font-semibold underline">Pessoas</Link>. 2) Lance seus gastos
            no botão <strong>Gasto</strong>. 3) Volte aqui para o Consultor te mostrar onde ajustar.
          </p>
        </Card>
      )}

      <SummaryCards s={s} />
      <QuickAdd summary={s} />
      <div className="grid gap-6 lg:grid-cols-2">
        <PeopleCard s={s} />
        <CategoriesCard s={s} />
      </div>
      <Consultant s={s} />
    </div>
  );
}

function SummaryCards({ s }: { s: Summary }) {
  const blue = s.balance >= 0;
  return (
    <section aria-label="Resumo do mês" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard icon={<Wallet className="size-4" />} label="Renda Total" value={brlFmt(s.income_total)} sub="o que entra por mês" />
      <StatCard
        icon={<Receipt className="size-4" />}
        label="Total de Gastos"
        value={brlFmt(s.expenses_total)}
        sub={s.expenses_total > 0 ? `${brlFmt(s.paid_total)} pago · ${brlFmt(s.pending_total)} a pagar` : 'nenhum gasto lançado'}
      />
      <StatCard
        icon={blue ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        label={blue ? 'Saldo Livre (sobra)' : 'Saldo Livre (falta)'}
        value={`${blue ? '' : '− '}${brlFmt(Math.abs(s.balance))}`}
        sub={blue ? 'dinheiro que sobra no mês' : 'dinheiro que está faltando'}
        tone={s.expenses_total === 0 && s.income_total === 0 ? undefined : blue ? 'good' : 'danger'}
      />
      <StatCard
        icon={<PiggyBank className="size-4" />}
        label="Total em Reservas"
        value={brlFmt(s.reserves_total)}
        sub={s.reserves_deposited_month > 0 ? `+${brlFmt(s.reserves_deposited_month)} guardados no mês` : 'nada guardado no mês'}
      />
    </section>
  );
}

function StatCard({ icon, label, value, sub, tone }: { icon: ReactNode; label: string; value: string; sub: string; tone?: 'good' | 'danger' }) {
  return (
    <Card className={cn('p-4', tone === 'good' && 'border-good/40 bg-good-soft', tone === 'danger' && 'border-danger/40 bg-danger-soft')}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
        {icon}
        {label}
      </div>
      <p className={cn('tabular mt-1 text-xl font-bold sm:text-2xl', tone === 'good' && 'text-good', tone === 'danger' && 'text-danger')}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </Card>
  );
}

const BLOCKS = [
  { key: 'critical', emoji: '🔴', title: 'Onde está faltando dinheiro', empty: 'Nenhum alerta crítico. Ótimo!', tone: 'border-danger/40', head: 'bg-danger-soft text-danger' },
  { key: 'attention', emoji: '🟡', title: 'Onde devo melhorar', empty: 'Nada a ajustar por enquanto.', tone: 'border-warn/40', head: 'bg-warn-soft text-warn' },
  { key: 'good', emoji: '🟢', title: 'Onde estou indo bem', empty: 'Lance seus gastos e rendas para ver os elogios aparecerem.', tone: 'border-good/40', head: 'bg-good-soft text-good' },
] as const;

function Consultant({ s }: { s: Summary }) {
  return (
    <section aria-labelledby="consultor">
      <div className="mb-3">
        <h2 id="consultor" className="text-lg font-bold">
          Consultor da Casa
        </h2>
        <p className="text-sm text-muted-foreground">Uma análise simples dos números de {monthLabel(s.month)}.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {BLOCKS.map((b) => {
          const items: Insight[] = s.diagnosis[b.key];
          return (
            <Card key={b.key} className={cn('overflow-hidden', b.tone)}>
              <h3 className={cn('flex items-center gap-2 px-4 py-3 text-sm font-semibold', b.head)}>
                <span aria-hidden>{b.emoji}</span> {b.title}
                {items.length > 0 && <Badge className="ml-auto bg-card/70 text-current">{items.length}</Badge>}
              </h3>
              <ul className="divide-y">
                {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">{b.empty}</li>}
                {items.map((i) => (
                  <li key={i.id} className="p-4">
                    <p className="flex gap-2 text-sm font-semibold">
                      {b.key === 'critical' && <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />}
                      {i.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{i.message}</p>
                    {i.tip && (
                      <p className="mt-2 flex gap-2 rounded-lg bg-muted p-2.5 text-sm">
                        <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                        <span>
                          <strong>Dica:</strong> {i.tip}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function PeopleCard({ s }: { s: Summary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quanto cada um precisa pagar</CardTitle>
        <CardDescription>E quanto sobra do salário depois das contas.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {s.members.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pessoa cadastrada ainda.</p>}
        {s.members.map((m) => {
          const used = m.monthly_income > 0 ? (m.owes / m.monthly_income) * 100 : m.owes > 0 ? 100 : 0;
          const neg = m.free < 0;
          return (
            <div key={m.id} className="rounded-lg border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{m.name}</p>
                <p className="text-xs text-muted-foreground">
                  ganha {brlFmt(m.monthly_income)} · {pctFmt(m.income_share)} da renda
                </p>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Precisa pagar</p>
                  <p className="tabular font-bold">{brlFmt(m.owes)}</p>
                  {m.owes > 0 && <p className="text-xs text-muted-foreground">{brlFmt(m.owes_pending)} ainda pendente</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{neg ? 'Falta' : 'Sobra'}</p>
                  <p className={cn('tabular font-bold', neg ? 'text-danger' : 'text-good')}>{brlFmt(Math.abs(m.free))}</p>
                </div>
              </div>
              <Progress className="mt-2 h-2" value={used} label={`${m.name} usa ${Math.round(used)}% do salário`} barClassName={neg ? 'bg-destructive' : used > 85 ? 'bg-amber-500' : 'bg-primary'} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CategoriesCard({ s }: { s: Summary }) {
  const cats = s.categories.filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  let acc = 0;
  const stops = cats.map((c) => {
    const from = acc;
    acc += c.share_of_expenses * 100;
    return `${CATEGORY_INFO[c.category].color} ${from}% ${acc}%`;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Para onde vai o dinheiro</CardTitle>
        <CardDescription>Gastos do mês por categoria.</CardDescription>
      </CardHeader>
      <CardContent>
        {cats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum gasto lançado neste mês.</p>
        ) : (
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <div
              role="img"
              aria-label={`Gráfico de rosca: ${cats.map((c) => `${CATEGORY_INFO[c.category].label} ${pctFmt(c.share_of_expenses)}`).join(', ')}`}
              className="relative size-40 shrink-0 rounded-full"
              style={{ background: `conic-gradient(${stops.join(',')})` }}
            >
              <div className="absolute inset-[27%] grid place-items-center rounded-full bg-card text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                  <p className="tabular text-xs font-bold leading-tight">{brlFmt(s.expenses_total)}</p>
                </div>
              </div>
            </div>
            <ul className="w-full flex-1 space-y-2.5">
              {cats.map((c) => {
                const info = CATEGORY_INFO[c.category];
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <info.icon className="size-4" style={{ color: info.color }} aria-hidden />
                        {info.label}
                      </span>
                      <span className="tabular font-medium">
                        {brlFmt(c.total)} <span className="text-xs font-normal text-muted-foreground">({pctFmt(c.share_of_expenses)})</span>
                      </span>
                    </div>
                    <Progress className="mt-1 h-1.5" value={c.share_of_expenses * 100} color={info.color} label={`${info.label}: ${pctFmt(c.share_of_expenses)} dos gastos`} />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
