import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CurrencyInput, Field, Input, Segmented, Select } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { CATEGORY_INFO, CATEGORY_ORDER } from '@/lib/categories';
import { brlFmt, daysInMonth, todayBR } from '@/lib/format';
import { useAction, useMembers } from '@/lib/queries';
import { previewSplit } from '@/lib/split';
import type { Category, Expense, ExpenseStatus, ExpenseType, SplitMode } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ExpenseDialog({ open, onClose, expense }: { open: boolean; onClose: () => void; expense?: Expense | null }) {
  return (
    <Dialog open={open} onClose={onClose} title={expense ? 'Editar gasto' : 'Novo gasto'} wide>
      <ExpenseForm key={expense?.id ?? 'novo'} expense={expense ?? null} onDone={onClose} />
    </Dialog>
  );
}

function ExpenseForm({ expense, onDone }: { expense: Expense | null; onDone: () => void }) {
  const { month } = useApp();
  const members = useMembers();
  const today = todayBR();

  const defaultDate = today.startsWith(month) ? today : `${month}-${String(Math.min(10, daysInMonth(month))).padStart(2, '0')}`;
  const formMonth = expense ? expense.month_year : month;

  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(expense?.amount ?? 0);
  const [category, setCategory] = useState<Category>(expense?.category ?? 'contas_basicas');
  const [type, setType] = useState<ExpenseType>(expense?.type ?? 'variable');
  const [status, setStatus] = useState<ExpenseStatus>(expense?.status ?? 'pending');
  const [due, setDue] = useState(expense?.due_date ?? defaultDate);
  const [mode, setMode] = useState<SplitMode>(expense?.split_mode ?? 'equal');
  const [selected, setSelected] = useState<number[] | null>(expense ? expense.splits.map((s) => s.member_id) : null);
  const [error, setError] = useState('');

  const list = members.data ?? [];
  const ids = selected ?? list.map((m) => m.id);
  const chosen = list.filter((m) => ids.includes(m.id));

  const save = useAction(
    (b: Parameters<typeof api.addExpense>[0]) => (expense ? api.updateExpense(expense.id, b) : api.addExpense(b)),
    { success: expense ? 'Gasto atualizado.' : 'Gasto salvo.', onSuccess: onDone },
  );

  const preview = useMemo(() => previewSplit(mode, amount, chosen), [mode, amount, chosen]);

  const toggle = (id: number) => {
    if (mode === 'individual') return setSelected([id]);
    setSelected(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };
  const changeMode = (m: SplitMode) => {
    setMode(m);
    if (m === 'individual' && ids.length !== 1) setSelected(ids.slice(0, 1).length ? ids.slice(0, 1) : list.slice(0, 1).map((x) => x.id));
    if (m !== 'individual' && selected && selected.length === 1 && list.length > 1) setSelected(null);
  };

  if (members.isPending) return <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>;
  if (list.length === 0) {
    return (
      <div className="py-4 text-center">
        <p className="font-medium">Cadastre quem mora na casa primeiro</p>
        <p className="mt-1 text-sm text-muted-foreground">Os gastos são divididos entre as pessoas, então precisamos saber quem são e quanto cada uma ganha.</p>
        <Link to="/pessoas" onClick={onDone} className="mt-4 inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Ir para Pessoas
        </Link>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Informe o nome do gasto (ex.: Aluguel).');
    if (amount <= 0) return setError('Informe o valor do gasto.');
    if (chosen.length === 0) return setError('Escolha pelo menos uma pessoa.');
    save.mutate({ title: title.trim(), amount, category, type, status, due_date: due, split_mode: mode, member_ids: chosen.map((m) => m.id) });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Nome do gasto">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Aluguel, Conta de luz, Mercado" maxLength={80} autoFocus={!expense} />}</Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor">{(p) => <CurrencyInput {...p} value={amount} onChange={setAmount} />}</Field>
        <Field label="Vencimento" hint={`Dentro de ${formMonth.slice(5)}/${formMonth.slice(0, 4)}`}>
          {(p) => <Input {...p} type="date" required value={due} min={`${formMonth}-01`} max={`${formMonth}-${daysInMonth(formMonth)}`} onChange={(e) => setDue(e.target.value)} />}
        </Field>
      </div>

      <Field label="Categoria">
        {(p) => (
          <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Tipo</span>
          <Segmented
            label="Tipo do gasto"
            value={type}
            onChange={setType}
            options={[
              { value: 'fixed', label: 'Fixo', description: 'sempre igual' },
              { value: 'variable', label: 'Variável', description: 'muda todo mês' },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Situação</span>
          <Segmented
            label="Situação"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Pendente' },
              { value: 'paid', label: 'Pago' },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Quem paga?</span>
        <Segmented
          label="Como dividir"
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'individual', label: 'Individual', description: 'uma pessoa' },
            { value: 'equal', label: 'Igual', description: 'mesmo valor' },
            { value: 'proportional', label: 'Proporcional', description: 'pela renda' },
          ]}
        />
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Pessoas">
          {list.map((m) => {
            const on = ids.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(m.id)}
                className={cn('min-h-10 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors', on ? 'border-primary bg-accent text-accent-foreground ring-1 ring-primary' : 'border-input bg-card hover:bg-muted')}
              >
                {on && '✓ '}
                {m.name}
              </button>
            );
          })}
        </div>
        {preview.length > 0 && (
          <ul className="mt-1 rounded-lg bg-muted p-3 text-sm" aria-label="Como fica a divisão">
            {preview.map((p) => (
              <li key={p.member.id} className="flex justify-between">
                <span>{p.member.name}</span>
                <span className="tabular font-medium">{brlFmt(p.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar gasto'}
        </Button>
      </div>
    </form>
  );
}
