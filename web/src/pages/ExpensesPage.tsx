import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Copy, Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/field';
import { ExpenseDialog } from '@/components/ExpenseDialog';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { CATEGORY_INFO, CATEGORY_ORDER, SPLIT_LABEL } from '@/lib/categories';
import { brlFmt, monthLabel, monthTitle, shiftMonth, shortDate, todayBR } from '@/lib/format';
import { useAction, useExpenses, useMembers } from '@/lib/queries';
import type { Category, Expense } from '@/lib/types';
import { cn } from '@/lib/utils';
import { EmptyState, PageHeader, Skeleton } from './shared';

export default function ExpensesPage() {
  const { month, openExpenseForm } = useApp();
  const q = useExpenses(month);
  const members = useMembers();
  const [status, setStatus] = useState<'all' | 'pending' | 'paid'>('all');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [removing, setRemoving] = useState<Expense | null>(null);
  const today = todayBR();

  const toggle = useAction(({ id, status }: { id: number; status: 'paid' | 'pending' }) => api.setExpenseStatus(id, status));
  const remove = useAction(api.deleteExpense, { success: 'Gasto removido.', onSuccess: () => setRemoving(null) });
  const dup = useAction(() => api.duplicateFixed(month, shiftMonth(month, -1)), {
    success: (r) =>
      r.found === 0
        ? `Não há gastos fixos em ${monthLabel(r.from)} para copiar.`
        : r.copied > 0
          ? `${r.copied} ${r.copied === 1 ? 'gasto fixo copiado' : 'gastos fixos copiados'} de ${monthLabel(r.from)}${r.skipped ? ` (${r.skipped} já existiam)` : ''}.`
          : 'Todos os gastos fixos do mês anterior já estão aqui.',
  });

  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);
  const all = q.data ?? [];
  const list = all.filter((e) => (status === 'all' || e.status === status) && (cat === 'all' || e.category === cat) && (tagFilter === 'all' || e.tag === tagFilter));
  const tagNames = [...new Set(all.map((e) => e.tag).filter((t): t is string => !!t))];
  const total = all.reduce((a, e) => a + e.amount, 0);
  const paid = all.filter((e) => e.status === 'paid').reduce((a, e) => a + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="Gastos do mês"
        description={monthTitle(month)}
        actions={
          <>
            <Button variant="outline" onClick={() => dup.mutate(undefined)} disabled={dup.isPending}>
              <Copy className="size-4" /> Duplicar gastos fixos do mês anterior
            </Button>
            <Button onClick={openExpenseForm} className="hidden sm:inline-flex">
              <Plus className="size-4" /> Novo gasto
            </Button>
          </>
        }
      />

      {q.isPending ? (
        <Skeleton />
      ) : all.length === 0 ? (
        <EmptyState title="Nenhum gasto neste mês" text="Lance seus gastos ou copie os fixos do mês anterior (aluguel, luz, internet…) para não digitar tudo de novo.">
          <Button onClick={openExpenseForm}>
            <Plus className="size-4" /> Lançar primeiro gasto
          </Button>
          <Button variant="outline" onClick={() => dup.mutate(undefined)} disabled={dup.isPending}>
            <Copy className="size-4" /> Duplicar fixos do mês anterior
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="tabular text-sm font-bold sm:text-lg">{brlFmt(total)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Já pago</p>
              <p className="tabular text-sm font-bold text-good sm:text-lg">{brlFmt(paid)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">A pagar</p>
              <p className="tabular text-sm font-bold sm:text-lg">{brlFmt(total - paid)}</p>
            </Card>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filtrar por situação" className="flex rounded-lg bg-muted p-1">
              {(
                [
                  ['all', 'Todos'],
                  ['pending', 'Pendentes'],
                  ['paid', 'Pagos'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={status === v}
                  onClick={() => setStatus(v)}
                  className={cn('min-h-9 cursor-pointer rounded-md px-3 text-sm font-medium', status === v ? 'bg-card shadow-sm' : 'text-muted-foreground')}
                >
                  {l}
                </button>
              ))}
            </div>
            <Select aria-label="Filtrar por categoria" className="h-9 w-auto" value={cat} onChange={(e) => setCat(e.target.value as Category | 'all')}>
              <option value="all">Todas as categorias</option>
              {CATEGORY_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_INFO[c].label}
                </option>
              ))}
            </Select>
            {tagNames.length > 0 && (
              <Select aria-label="Filtrar por tag" className="h-9 w-auto" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="all">Todas as tags</option>
                {tagNames.map((t) => (
                  <option key={t} value={t}>
                    # {t}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum gasto com esse filtro.</p>}
          <ul className="flex flex-col gap-2">
            {list.map((e) => {
              const info = CATEGORY_INFO[e.category];
              const overdue = e.status === 'pending' && e.due_date < today;
              return (
                <li key={e.id}>
                  <Card className={cn('flex items-start gap-3 p-3', overdue && 'border-danger/50')}>
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ id: e.id, status: e.status === 'paid' ? 'pending' : 'paid' })}
                      aria-label={e.status === 'paid' ? `Marcar ${e.title} como pendente` : `Marcar ${e.title} como pago`}
                      aria-pressed={e.status === 'paid'}
                      className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-muted"
                    >
                      {e.status === 'paid' ? <CheckCircle2 className="size-7 text-good" /> : <Circle className="size-7 text-muted-foreground" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('font-semibold leading-snug', e.status === 'paid' && 'text-muted-foreground line-through decoration-1')}>{e.title}</p>
                        <p className="tabular shrink-0 font-bold">{brlFmt(e.amount)}</p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge style={{ background: `${info.color}22`, color: info.color }}>
                          <info.icon className="size-3" aria-hidden /> {info.label}
                        </Badge>
                        <Badge>{e.type === 'fixed' ? 'Fixo' : 'Variável'}</Badge>
                        {e.tag && (
                          <Badge tone="primary">
                            <TagIcon className="size-3" aria-hidden /> {e.tag}
                          </Badge>
                        )}
                        <Badge tone={overdue ? 'danger' : e.status === 'paid' ? 'good' : 'neutral'}>
                          {overdue ? 'Atrasado · ' : e.status === 'paid' ? 'Pago · ' : 'Vence '}
                          {shortDate(e.due_date)}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {SPLIT_LABEL[e.split_mode]}:{' '}
                        {e.splits.map((s) => `${memberName.get(s.member_id) ?? '—'} ${brlFmt(s.assigned_amount)}`).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col sm:flex-row">
                      <Button variant="ghost" size="icon" aria-label={`Editar ${e.title}`} onClick={() => setEditing(e)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="danger-ghost" size="icon" aria-label={`Excluir ${e.title}`} onClick={() => setRemoving(e)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ExpenseDialog open={!!editing} expense={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        busy={remove.isPending}
        title="Excluir este gasto?"
        description={removing ? `"${removing.title}" (${brlFmt(removing.amount)}) será removido.` : ''}
        confirmLabel="Excluir"
      />
    </div>
  );
}
