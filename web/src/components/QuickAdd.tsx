import { useState } from 'react';
import { Clock, Plus, Settings2, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { CurrencyInput, Field, Input, Select } from '@/components/ui/field';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { CATEGORY_INFO, CATEGORY_ORDER, FREQUENCY_INFO, FREQUENCY_ORDER } from '@/lib/categories';
import { brlFmt, formatDateTime, formatShortDateTime, pctFmt } from '@/lib/format';
import { useAction, useTags } from '@/lib/queries';
import type { Summary, Tag } from '@/lib/types';
import { cn } from '@/lib/utils';

const SUGGESTED: Pick<Tag, 'name' | 'category' | 'default_amount'>[] = [
  { name: 'Uber / 99', category: 'transporte', default_amount: 15 },
  { name: 'Lanche na rua', category: 'alimentacao', default_amount: 12.5 },
  { name: 'Padaria', category: 'alimentacao', default_amount: 10 },
  { name: 'Farmácia', category: 'saude', default_amount: 0 },
  { name: 'Lazer / sorvete', category: 'lazer', default_amount: 0 },
];

/** Resumo por frequência (Do dia / Semanal / Mensal) e tags rápidas que abrem o formulário único de gasto. */
export function QuickAdd({ summary }: { summary: Summary }) {
  const { openExpenseForm } = useApp();
  const tags = useTags();
  const [form, setForm] = useState<Tag | 'new' | null>(null);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const [manage, setManage] = useState(false);

  const remove = useAction(api.deleteTag, { success: 'Tag removida (os gastos já lançados continuam).', onSuccess: () => setRemoving(null) });
  const suggest = useAction(async () => {
    for (const t of SUGGESTED) await api.addTag(t);
  }, { success: 'Tags sugeridas adicionadas.' });

  const totals = new Map(summary.tags.map((t) => [t.name, t]));
  const list = tags.data ?? [];
  const totalFreq = summary.expenses_total;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4 text-primary" aria-hidden /> Como o dinheiro sai no mês
          </CardTitle>
          <CardDescription>Veja o peso do dia a dia, semanal e mensal — toque em um bloco ou tag para lançar.</CardDescription>
        </div>
        {list.length > 0 && (
          <Button variant={manage ? 'secondary' : 'ghost'} size="sm" onClick={() => setManage((m) => !m)} aria-pressed={manage}>
            <Settings2 className="size-4" /> {manage ? 'Pronto' : 'Editar tags'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {FREQUENCY_ORDER.map((f) => {
            const info = FREQUENCY_INFO[f];
            const stat = summary.by_frequency[f];
            const share = totalFreq > 0 ? stat.total / totalFreq : 0;
            return (
              <div key={f} className="flex items-center justify-between gap-2 rounded-xl border p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ background: info.color }} aria-hidden />
                    {info.label}
                    {stat.count > 0 && <span>· {pctFmt(share)}</span>}
                  </div>
                  <p className="tabular mt-0.5 text-base font-bold sm:text-lg">{brlFmt(stat.total)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {stat.count === 0 ? info.hint : `${stat.count} ${stat.count === 1 ? 'lançamento' : 'lançamentos'}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openExpenseForm({ frequency: f })}
                  aria-label={`Novo gasto ${info.label}`}
                  className="shrink-0"
                >
                  <Plus className="size-4" /> Lançar
                </Button>
              </div>
            );
          })}
        </div>

        {totalFreq > 0 && (
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            {FREQUENCY_ORDER.map((f) => {
              const pct = (summary.by_frequency[f].total / totalFreq) * 100;
              return pct > 0 ? <div key={f} style={{ width: `${pct}%`, background: FREQUENCY_INFO[f].color }} /> : null;
            })}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Atalhos do dia a dia (tags)</p>
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
            <ul className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {list.map((t) => {
                const info = CATEGORY_INFO[t.category];
                const tot = totals.get(t.name);
                const stamp = tot?.last_at ? `Último: ${formatShortDateTime(tot.last_at)}` : t.created_at ? `Criada: ${formatShortDateTime(t.created_at)}` : '';
                return (
                  <li key={t.id} className="flex min-w-0 items-stretch">
                    <button
                      type="button"
                      onClick={() => (manage ? setForm(t) : openExpenseForm({ frequency: 'daily', tag: t }))}
                      className={cn(
                        'flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-2.5 border bg-card px-3 py-2 text-left transition-colors hover:bg-muted sm:flex-initial',
                        manage ? 'rounded-l-xl border-r-0' : 'rounded-xl',
                      )}
                      aria-label={manage ? `Editar tag ${t.name}` : `Lançar gasto em ${t.name}`}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${info.color}22`, color: info.color }}>
                        <info.icon className="size-4" aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-3 sm:block">
                        <span className="min-w-0 leading-tight">
                          <span className="block text-sm font-medium">{t.name}</span>
                          {stamp && (
                            <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80">
                              <Clock className="size-3 shrink-0" aria-hidden /> {stamp}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-right text-xs font-medium text-muted-foreground tabular sm:mt-0.5 sm:block sm:text-left sm:font-normal">
                          {tot ? `${brlFmt(tot.total)} · ${tot.count}×` : 'nada no mês'}
                        </span>
                      </span>
                    </button>
                    {manage && (
                      <button
                        type="button"
                        onClick={() => setRemoving(t)}
                        aria-label={`Excluir tag ${t.name}`}
                        className="grid w-10 shrink-0 cursor-pointer place-items-center rounded-r-xl border text-danger hover:bg-danger-soft sm:w-11"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
              <li className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setForm('new')}
                  className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 text-sm font-medium text-muted-foreground hover:bg-muted sm:w-auto"
                >
                  <Plus className="size-4" /> Nova tag
                </button>
              </li>
            </ul>
          )}
        </div>
      </CardContent>

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
      {tag?.created_at && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5 shrink-0" aria-hidden /> Criada em {formatDateTime(tag.created_at)}
        </p>
      )}
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
