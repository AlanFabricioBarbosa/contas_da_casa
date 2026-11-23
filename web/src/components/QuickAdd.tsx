import { useState } from 'react';
import { Plus, Settings2, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { CurrencyInput, Field, Input, Select } from '@/components/ui/field';
import { api } from '@/lib/api';
import { CATEGORY_INFO, CATEGORY_ORDER } from '@/lib/categories';
import { brlFmt, fullDate, todayBR } from '@/lib/format';
import { useAction, useMembers, useTags } from '@/lib/queries';
import type { Summary, Tag } from '@/lib/types';
import { cn } from '@/lib/utils';

const SUGGESTED: Omit<Tag, 'id'>[] = [
  { name: 'Uber / 99', category: 'transporte', default_amount: 15 },
  { name: 'Lanche na rua', category: 'alimentacao', default_amount: 12.5 },
  { name: 'Padaria', category: 'alimentacao', default_amount: 10 },
  { name: 'Farmácia', category: 'saude', default_amount: 0 },
  { name: 'Lazer / sorvete', category: 'lazer', default_amount: 0 },
];

/** Atalhos (tags) para lançar em poucos toques os gastinhos do dia a dia. */
export function QuickAdd({ summary }: { summary: Summary }) {
  const tags = useTags();
  const [spend, setSpend] = useState<Tag | null>(null);
  const [form, setForm] = useState<Tag | 'new' | null>(null);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const [manage, setManage] = useState(false);

  const remove = useAction(api.deleteTag, { success: 'Tag removida (os gastos já lançados continuam).', onSuccess: () => setRemoving(null) });
  const suggest = useAction(async () => {
    for (const t of SUGGESTED) await api.addTag(t);
  }, { success: 'Tags sugeridas adicionadas.' });

  const totals = new Map(summary.tags.map((t) => [t.name, t]));
  const list = tags.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-primary" aria-hidden /> Gastos do dia a dia
          </CardTitle>
          <CardDescription>Toque numa tag para lançar na hora. Os totais abaixo são do mês selecionado.</CardDescription>
        </div>
        {list.length > 0 && (
          <Button variant={manage ? 'secondary' : 'ghost'} size="sm" onClick={() => setManage((m) => !m)} aria-pressed={manage}>
            <Settings2 className="size-4" /> {manage ? 'Pronto' : 'Editar tags'}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {tags.isPending ? null : list.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">Crie tags para os gastos pequenos e frequentes (Uber, lanche, padaria…) e lance cada um em 2 toques.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button onClick={() => suggest.mutate(undefined)} disabled={suggest.isPending}>
                Adicionar tags sugeridas
              </Button>
              <Button variant="outline" onClick={() => setForm('new')}>
                <Plus className="size-4" /> Criar minha tag
              </Button>
            </div>
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {list.map((t) => {
              const info = CATEGORY_INFO[t.category];
              const tot = totals.get(t.name);
              return (
                <li key={t.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => (manage ? setForm(t) : setSpend(t))}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-2 border bg-card px-3 text-left transition-colors hover:bg-muted',
                      manage ? 'rounded-l-xl border-r-0' : 'rounded-xl',
                    )}
                    aria-label={manage ? `Editar tag ${t.name}` : `Lançar gasto em ${t.name}`}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${info.color}22`, color: info.color }}>
                      <info.icon className="size-4" aria-hidden />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-sm font-medium">{t.name}</span>
                      <span className="block text-xs text-muted-foreground tabular">
                        {tot ? `${brlFmt(tot.total)} · ${tot.count}×` : 'nada no mês'}
                      </span>
                    </span>
                  </button>
                  {manage && (
                    <button
                      type="button"
                      onClick={() => setRemoving(t)}
                      aria-label={`Excluir tag ${t.name}`}
                      className="grid w-11 cursor-pointer place-items-center rounded-r-xl border text-danger hover:bg-danger-soft"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setForm('new')}
                className="flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl border border-dashed px-3 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-4" /> Nova tag
              </button>
            </li>
          </ul>
        )}
      </CardContent>

      <Dialog open={!!spend} onClose={() => setSpend(null)} title={spend ? `Lançar: ${spend.name}` : ''}>
        {spend && <SpendForm key={spend.id} tag={spend} onDone={() => setSpend(null)} />}
      </Dialog>
      <Dialog open={!!form} onClose={() => setForm(null)} title={form && form !== 'new' ? 'Editar tag' : 'Nova tag'}>
        {form && <TagForm key={form === 'new' ? 'new' : form.id} tag={form === 'new' ? null : form} onDone={() => setForm(null)} />}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        busy={remove.isPending}
        title={`Excluir a tag "${removing?.name ?? ''}"?`}
        description="Os gastos já lançados com essa tag continuam no mês. Só o atalho some."
        confirmLabel="Excluir tag"
      />
    </Card>
  );
}

const ALL = 'all';

function SpendForm({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const members = useMembers();
  const list = members.data ?? [];
  const [amount, setAmount] = useState(tag.default_amount);
  const [who, setWho] = useState<string>(() => localStorage.getItem('quemPagou') ?? '');
  const [date, setDate] = useState(todayBR());
  const [error, setError] = useState('');

  const person = who === ALL ? ALL : list.some((m) => String(m.id) === who) ? who : list[0] ? String(list[0].id) : '';

  const save = useAction(
    () =>
      api.addExpense({
        title: tag.name,
        amount,
        category: tag.category,
        type: 'variable',
        split_mode: person === ALL ? 'equal' : 'individual',
        status: 'paid',
        due_date: date,
        member_ids: person === ALL ? list.map((m) => m.id) : [Number(person)],
        tag: tag.name,
      }),
    { success: `${tag.name}: ${brlFmt(amount)} lançado em ${fullDate(date)}.`, onSuccess: onDone },
  );

  if (members.isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (list.length === 0) return <p className="text-sm">Cadastre as pessoas da casa primeiro (aba Pessoas).</p>;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount <= 0) return setError('Informe quanto foi.');
        setError('');
        localStorage.setItem('quemPagou', person);
        save.mutate(undefined);
      }}
    >
      <Field label="Quanto foi?" error={error}>
        {(p) => <CurrencyInput {...p} value={amount} onChange={setAmount} autoFocus />}
      </Field>
      <Field label="Quem pagou?">
        {(p) => (
          <Select {...p} value={person} onChange={(e) => setWho(e.target.value)}>
            {list.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            {list.length > 1 && <option value={ALL}>Todos (dividir igualmente)</option>}
          </Select>
        )}
      </Field>
      <Field label="Data" hint="Já entra como pago, pois o dinheiro já saiu.">
        {(p) => <Input {...p} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Lançando…' : 'Lançar gasto'}
        </Button>
      </div>
    </form>
  );
}

function TagForm({ tag, onDone }: { tag: Tag | null; onDone: () => void }) {
  const [name, setName] = useState(tag?.name ?? '');
  const [category, setCategory] = useState(tag?.category ?? 'alimentacao');
  const [amount, setAmount] = useState(tag?.default_amount ?? 0);
  const [error, setError] = useState('');
  const save = useAction(
    () => {
      const b = { name: name.trim(), category, default_amount: amount };
      return tag ? api.updateTag(tag.id, b) : api.addTag(b);
    },
    { success: tag ? 'Tag atualizada.' : 'Tag criada.', onSuccess: onDone },
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Dê um nome (ex.: Uber, Lanche na rua).');
        setError('');
        save.mutate(undefined);
      }}
    >
      <Field label="Nome da tag" error={error}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Uber, Lanche na rua" maxLength={40} autoFocus />}
      </Field>
      <Field label="Categoria">
        {(p) => (
          <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as Tag['category'])}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_INFO[c].label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Valor de costume (opcional)" hint="Já vem preenchido na hora de lançar; dá para mudar a cada vez.">
        {(p) => <CurrencyInput {...p} value={amount} onChange={setAmount} />}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar tag'}
        </Button>
      </div>
    </form>
  );
}

