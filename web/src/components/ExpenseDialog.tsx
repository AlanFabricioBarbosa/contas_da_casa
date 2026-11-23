import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Plus, Tag as TagIcon } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CurrencyInput, Field, Input, Segmented, Select } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useApp, type ExpensePreset } from '@/lib/app-context';
import { CATEGORY_INFO, CATEGORY_ORDER } from '@/lib/categories';
import { brlFmt, daysInMonth, formatShortDateTime, formatTime, fullDate, shiftMonth, todayBR } from '@/lib/format';
import { useAction, useMembers, useTags } from '@/lib/queries';
import { previewSplit } from '@/lib/split';
import type { Category, Expense, ExpenseFrequency, ExpenseStatus, ExpenseType, SplitMode, Tag } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ExpenseDialog({
  open,
  onClose,
  expense,
  preset,
  sessionKey,
}: {
  open: boolean;
  onClose: () => void;
  expense?: Expense | null;
  preset?: ExpensePreset;
  sessionKey?: number;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={expense ? 'Editar gasto' : 'Novo gasto'} wide>
      <ExpenseForm key={expense ? `edit-${expense.id}` : `new-${sessionKey ?? 0}`} expense={expense ?? null} preset={preset} onDone={onClose} />
    </Dialog>
  );
}

const QUICK_INSTALLMENTS = [2, 3, 6, 10, 12];

function calcEndMonth(startDate: string, count: number, frequency: ExpenseFrequency): string {
  if (frequency === 'weekly') {
    const [y, m, d] = startDate.split('-').map(Number) as [number, number, number];
    const dt = new Date(Date.UTC(y, m - 1, d + (count - 1) * 7));
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
  }
  const endM = shiftMonth(startDate.slice(0, 7), count - 1);
  return `${endM.slice(5)}/${endM.slice(0, 4)}`;
}

function ExpenseForm({ expense, preset, onDone }: { expense: Expense | null; preset?: ExpensePreset; onDone: () => void }) {
  const { month, setMonth } = useApp();
  const members = useMembers();
  const tags = useTags();
  const today = todayBR();

  const initialFreq: ExpenseFrequency = expense?.frequency ?? preset?.frequency ?? (preset?.tag ? 'daily' : 'monthly');
  const formMonth = expense ? expense.month_year : month;
  const defaultDay = initialFreq === 'monthly' ? Math.min(10, daysInMonth(month)) : Math.min(Number(today.slice(8, 10)), daysInMonth(month));
  const defaultDate = today.startsWith(month)
    ? today
    : `${month}-${String(defaultDay).padStart(2, '0')}`;

  const [frequency, setFrequency] = useState<ExpenseFrequency>(initialFreq);
  const [title, setTitle] = useState(expense?.title ?? preset?.tag?.name ?? '');
  const [amount, setAmount] = useState(expense?.amount ?? preset?.tag?.default_amount ?? 0);
  const [category, setCategory] = useState<Category>(expense?.category ?? preset?.tag?.category ?? (initialFreq === 'daily' ? 'alimentacao' : 'contas_basicas'));
  const [type, setType] = useState<ExpenseType>(expense?.type ?? (initialFreq === 'monthly' ? 'fixed' : 'variable'));
  const [status, setStatus] = useState<ExpenseStatus>(expense?.status ?? (initialFreq === 'monthly' ? 'pending' : 'paid'));
  const [due, setDue] = useState(expense?.due_date ?? defaultDate);
  const [tag, setTag] = useState(expense?.tag ?? preset?.tag?.name ?? '');
  const [mode, setMode] = useState<SplitMode>(expense?.split_mode ?? (preset?.tag ? 'individual' : 'equal'));
  const [selected, setSelected] = useState<number[] | null>(expense ? expense.splits.map((s) => s.member_id) : null);

  // Parcelamento (só ao criar um gasto novo)
  const [payMode, setPayMode] = useState<'single' | 'installments'>('single');
  const [installments, setInstallments] = useState(3);
  const [amountMode, setAmountMode] = useState<'total' | 'installment'>('total');

  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [error, setError] = useState('');

  const list = members.data ?? [];
  const tagList = tags.data ?? [];
  const rawIds = selected ?? (mode === 'individual' ? list.slice(0, 1).map((m) => m.id) : list.map((m) => m.id));
  const ids = mode === 'individual' ? rawIds.slice(0, 1) : rawIds;
  const chosen = list.filter((m) => ids.includes(m.id));

  const isParcel = !expense && payMode === 'installments';
  const count = isParcel ? Math.max(2, Math.min(60, Math.round(installments) || 2)) : 1;

  // Valor de cada parcela (para pré-visualização da divisão por pessoa)
  const sampleInstallmentAmount = useMemo(() => {
    if (!isParcel) return amount;
    if (amountMode === 'installment') return amount;
    return amount > 0 ? Math.round((amount * 100) / count) / 100 : 0;
  }, [isParcel, amountMode, amount, count]);

  const totalPurchaseAmount = isParcel && amountMode === 'installment' ? Math.round(amount * 100 * count) / 100 : amount;

  const save = useAction(
    (b: Parameters<typeof api.addExpense>[0]) => (expense ? api.updateExpense(expense.id, b) : api.addExpense(b)),
    {
      success: (saved) => {
        if (expense) return 'Gasto atualizado.';
        const createdCount = 'created_count' in saved && typeof saved.created_count === 'number' ? saved.created_count : 1;
        if (createdCount > 1) {
          return `${saved.title}: ${createdCount} parcelas criadas a partir de ${fullDate(saved.due_date)}.`;
        }
        return `${saved.title}: ${brlFmt(saved.amount)} salvo em ${fullDate(saved.due_date)} às ${formatTime(saved.created_at)}.`;
      },
      onSuccess: (saved) => {
        if (!expense && saved.month_year !== month) setMonth(saved.month_year);
        onDone();
      },
    },
  );

  const createQuickTag = useAction(
    () => api.addTag({ name: newTagName.trim(), category, default_amount: amount > 0 ? amount : 0 }),
    {
      success: 'Tag criada.',
      onSuccess: (created) => {
        setTag(created.name);
        if (!title.trim()) setTitle(created.name);
        setNewTagName('');
        setAddingTag(false);
      },
    },
  );

  const preview = useMemo(() => previewSplit(mode, sampleInstallmentAmount, chosen), [mode, sampleInstallmentAmount, chosen]);

  const changeFrequency = (f: ExpenseFrequency) => {
    setFrequency(f);
    if (!expense) {
      if (f === 'daily' || f === 'weekly') {
        setType('variable');
        setStatus('paid');
      } else {
        setType('fixed');
        setStatus('pending');
      }
    }
  };

  const applyTag = (t: Tag) => {
    if (tag === t.name) {
      setTag('');
      return;
    }
    const prevWasTag = tagList.some((x) => x.name === title.trim());
    setTag(t.name);
    if (!title.trim() || prevWasTag) setTitle(t.name);
    setCategory(t.category);
    if (t.default_amount > 0 && (amount === 0 || prevWasTag)) setAmount(t.default_amount);
  };

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
    if (!title.trim()) return setError('Informe o nome do gasto (ex.: Aluguel, Padaria, Geladeira).');
    if (amount <= 0) return setError('Informe o valor.');
    if (isParcel && amountMode === 'total' && Math.round(amount * 100) < count) {
      return setError('O valor total precisa dar pelo menos R$ 0,01 por parcela.');
    }
    if (chosen.length === 0) return setError('Escolha pelo menos uma pessoa.');

    save.mutate({
      title: title.trim(),
      amount,
      category,
      type: frequency === 'daily' || isParcel ? 'variable' : type,
      frequency,
      status,
      due_date: due,
      split_mode: mode,
      member_ids: chosen.map((m) => m.id),
      tag: tag || null,
      ...(isParcel ? { installments: count, installment_amount_mode: amountMode } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {expense?.installment_num && expense?.installment_total && (
        <p className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-foreground">
          <CreditCard className="size-4 shrink-0" aria-hidden />
          Parcela {expense.installment_num} de {expense.installment_total}. As mudanças abaixo valem apenas para esta parcela.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Frequência do gasto</span>
        <Segmented
          label="Frequência do gasto"
          value={frequency}
          onChange={changeFrequency}
          options={[
            { value: 'daily', label: 'Do dia', description: 'Uber, lanche, avulso' },
            { value: 'weekly', label: 'Semanal', description: 'feira, semana' },
            { value: 'monthly', label: 'Mensal', description: 'conta do mês' },
          ]}
        />
      </div>

      {frequency === 'daily' && (
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TagIcon className="size-3.5" aria-hidden /> Atalhos rápidos (tags)
            </span>
            <button
              type="button"
              onClick={() => setAddingTag((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Plus className="size-3.5" /> {addingTag ? 'Fechar' : 'Nova tag'}
            </button>
          </div>
          {addingTag && (
            <div className="mt-2 flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nome da tag (ex.: Café, Mototáxi)"
                maxLength={40}
                className="h-9 flex-1"
              />
              <Button
                size="sm"
                onClick={() => newTagName.trim() && createQuickTag.mutate(undefined)}
                disabled={createQuickTag.isPending || !newTagName.trim()}
              >
                Criar
              </Button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tagList.length === 0 && !addingTag && (
              <p className="text-xs text-muted-foreground">Sem tags ainda — clique em "Nova tag" ou digite o gasto abaixo.</p>
            )}
            {tagList.map((t) => {
              const info = CATEGORY_INFO[t.category];
              const active = tag === t.name;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => applyTag(t)}
                  className={cn(
                    'inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    active ? 'border-primary bg-accent text-accent-foreground ring-1 ring-primary' : 'border-input bg-card hover:bg-muted',
                  )}
                >
                  <info.icon className="size-3.5" style={{ color: info.color }} aria-hidden />
                  {t.name}
                  {t.default_amount > 0 && <span className="tabular text-[11px] opacity-75">· {brlFmt(t.default_amount)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Field label="Nome do gasto">
        {(p) => (
          <Input
            {...p}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isParcel ? 'Ex.: Geladeira, Tênis, Parcela celular' : frequency === 'daily' ? 'Ex.: Lanche na rua, Uber, Padaria' : frequency === 'weekly' ? 'Ex.: Feira da semana, Passagens' : 'Ex.: Aluguel, Conta de luz, Internet'}
            maxLength={80}
            autoFocus={!expense && !preset?.tag}
          />
        )}
      </Field>

      {!expense && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Pagamento</span>
          <Segmented
            label="Forma de pagamento"
            value={payMode}
            onChange={setPayMode}
            options={[
              { value: 'single', label: 'À vista / única', description: 'lança só uma vez' },
              { value: 'installments', label: 'Parcelado', description: 'divide em várias vezes' },
            ]}
          />
        </div>
      )}

      {isParcel && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-accent/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quantas parcelas?">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={60}
                  value={installments}
                  onChange={(e) => setInstallments(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
                />
              )}
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">O valor abaixo é</span>
              <Segmented
                label="Valor informado"
                value={amountMode}
                onChange={setAmountMode}
                options={[
                  { value: 'total', label: 'Total' },
                  { value: 'installment', label: 'Da parcela' },
                ]}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_INSTALLMENTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setInstallments(n)}
                className={cn(
                  'h-8 cursor-pointer rounded-full border px-3 text-xs font-medium transition-colors',
                  count === n ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted',
                )}
              >
                {n}x
              </button>
            ))}
          </div>
          {amount > 0 && (
            <p className="text-xs text-foreground">
              Serão criadas <strong>{count} parcelas</strong> de{' '}
              <strong className="tabular">{brlFmt(sampleInstallmentAmount)}</strong>{' '}
              (total <strong className="tabular">{brlFmt(totalPurchaseAmount)}</strong>),{' '}
              {frequency === 'weekly'
                ? `toda semana de ${fullDate(due)} até ${calcEndMonth(due, count, frequency)}.`
                : `mês a mês de ${due.slice(5, 7)}/${due.slice(0, 4)} até ${calcEndMonth(due, count, frequency)}.`}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isParcel ? (amountMode === 'total' ? 'Valor total da compra' : 'Valor de cada parcela') : 'Valor'}>
          {(p) => <CurrencyInput {...p} value={amount} onChange={setAmount} autoFocus={!!preset?.tag} />}
        </Field>
        <Field
          label={isParcel ? 'Data da 1ª parcela' : frequency === 'monthly' ? 'Vencimento' : 'Data'}
          hint={
            expense?.created_at
              ? `Lançado em ${formatShortDateTime(expense.created_at)}`
              : `Hora do registro: ${formatTime(new Date().toISOString())}`
          }
        >
          {(p) => (
            <Input
              {...p}
              type="date"
              required
              value={due}
              min={expense ? `${formMonth}-01` : undefined}
              max={expense ? `${formMonth}-${daysInMonth(formMonth)}` : undefined}
              onChange={(e) => setDue(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className={cn('grid gap-4', frequency !== 'daily' && 'sm:grid-cols-2')}>
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
        {frequency !== 'daily' && (
          <Field label="Tag (opcional)">
            {(p) => (
              <Select {...p} value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Sem tag</option>
                {tagList.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
                {tag && !tagList.some((t) => t.name === tag) && <option value={tag}>{tag}</option>}
              </Select>
            )}
          </Field>
        )}
      </div>

      <div className={cn('grid gap-4', frequency !== 'daily' && !isParcel && 'sm:grid-cols-2')}>
        {frequency !== 'daily' && !isParcel && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Valor</span>
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
        )}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{isParcel ? 'Situação da 1ª parcela' : 'Situação'}</span>
          <Segmented
            label="Situação"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'pending', label: 'Pendente' },
              { value: 'paid', label: 'Pago' },
            ]}
          />
          {isParcel && <span className="text-xs text-muted-foreground">As parcelas seguintes (2ª em diante) entram como Pendente.</span>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Quem paga{isParcel ? ' cada parcela' : ''}?</span>
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
                <span className="tabular font-medium">
                  {brlFmt(p.value)}
                  {isParcel ? '/parcela' : ''}
                </span>
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
          {save.isPending ? 'Salvando…' : isParcel ? `Salvar ${count} parcelas` : 'Salvar gasto'}
        </Button>
      </div>
    </form>
  );
}
