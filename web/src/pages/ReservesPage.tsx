import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, History, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { CurrencyInput, Field, Input, Segmented, Select } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { RESERVE_KIND_LABEL } from '@/lib/categories';
import { brlFmt, fullDate, pctFmt, todayBR } from '@/lib/format';
import { useAction, useMembers, useReserves } from '@/lib/queries';
import type { Reserve, ReserveKind } from '@/lib/types';
import { EmptyState, PageHeader, Skeleton } from './shared';

type ReserveForm = { reserve: Reserve | null; preset?: { name: string; kind: ReserveKind } } | null;

const TEMPLATES: { name: string; kind: ReserveKind }[] = [
  { name: 'Reserva de Emergência', kind: 'emergency' },
  { name: 'Contas Anuais / IPTU', kind: 'annual' },
  { name: 'Meta Pessoal', kind: 'goal' },
];

export default function ReservesPage() {
  const q = useReserves();
  const [form, setForm] = useState<ReserveForm>(null);
  const [move, setMove] = useState<{ reserve: Reserve; type: 'deposit' | 'withdraw' } | null>(null);
  const [history, setHistory] = useState<Reserve | null>(null);
  const [removing, setRemoving] = useState<Reserve | null>(null);
  const remove = useAction(api.deleteReserve, { success: 'Reserva removida.', onSuccess: () => setRemoving(null) });

  const reserves = q.data ?? [];
  const total = reserves.reduce((a, r) => a + r.current_amount, 0);

  return (
    <div>
      <PageHeader
        title="Reservas e caixinhas"
        description="Separe dinheiro para imprevistos, contas do ano e sonhos."
        actions={
          <Button onClick={() => setForm({ reserve: null })}>
            <Plus className="size-4" /> Nova reserva
          </Button>
        }
      />

      {q.isPending ? (
        <Skeleton />
      ) : reserves.length === 0 ? (
        <EmptyState title="Nenhuma reserva ainda" text="Comece pequeno: até R$ 20 por mês já cria o hábito. Escolha um modelo:">
          {TEMPLATES.map((t) => (
            <Button key={t.name} variant="outline" onClick={() => setForm({ reserve: null, preset: t })}>
              <Plus className="size-4" /> {t.name}
            </Button>
          ))}
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4 flex items-center gap-3 border-primary/30 bg-accent p-4 text-accent-foreground">
            <PiggyBank className="size-6" aria-hidden />
            <div>
              <p className="text-sm">Total guardado</p>
              <p className="tabular text-2xl font-bold">{brlFmt(total)}</p>
            </div>
          </Card>
          <ul className="grid gap-4 md:grid-cols-2">
            {reserves.map((r) => {
              const pct = r.target_amount > 0 ? r.current_amount / r.target_amount : 0;
              const done = r.target_amount > 0 && r.current_amount >= r.target_amount;
              return (
                <li key={r.id}>
                  <Card className="flex h-full flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{RESERVE_KIND_LABEL[r.kind]}</p>
                      </div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" aria-label={`Editar ${r.name}`} onClick={() => setForm({ reserve: r })}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="danger-ghost" size="icon" aria-label={`Excluir ${r.name}`} onClick={() => setRemoving(r)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <p className="tabular mt-3 text-2xl font-bold">{brlFmt(r.current_amount)}</p>
                    {r.target_amount > 0 ? (
                      <>
                        <Progress className="mt-2 h-4" value={pct * 100} barClassName={done ? 'bg-good' : undefined} label={`${r.name}: ${pctFmt(Math.min(pct, 1))} da meta`} />
                        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                          <span>{pctFmt(Math.min(pct, 1))} de {brlFmt(r.target_amount)}</span>
                          {done ? <Badge tone="good">Meta alcançada! 🎉</Badge> : <span>faltam {brlFmt(r.target_amount - r.current_amount)}</span>}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">Sem meta definida — edite para colocar um valor-alvo.</p>
                    )}

                    {r.contributions.length > 0 && (
                      <p className="mt-3 flex flex-wrap gap-1.5 text-xs">
                        {r.contributions.map((c) => (
                          <Badge key={c.member_id} tone="primary">
                            {c.name}: {brlFmt(c.total)}
                          </Badge>
                        ))}
                      </p>
                    )}

                    <div className="mt-auto grid grid-cols-3 gap-2 pt-4">
                      <Button size="sm" onClick={() => setMove({ reserve: r, type: 'deposit' })}>
                        <ArrowDownCircle className="size-4" /> Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setMove({ reserve: r, type: 'withdraw' })} disabled={r.current_amount <= 0}>
                        <ArrowUpCircle className="size-4" /> Retirar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistory(r)}>
                        <History className="size-4" /> Histórico
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog open={!!form} onClose={() => setForm(null)} title={form?.reserve ? 'Editar reserva' : 'Nova reserva'}>
        {form && <ReserveFormView key={form.reserve?.id ?? form.preset?.name ?? 'new'} form={form} onDone={() => setForm(null)} />}
      </Dialog>
      <Dialog open={!!move} onClose={() => setMove(null)} title={move ? `${move.type === 'deposit' ? 'Guardar em' : 'Retirar de'} ${move.reserve.name}` : ''}>
        {move && <MoveForm key={`${move.reserve.id}-${move.type}`} reserve={move.reserve} type={move.type} onDone={() => setMove(null)} />}
      </Dialog>
      <Dialog open={!!history} onClose={() => setHistory(null)} title={history ? `Histórico — ${history.name}` : ''} wide>
        {history && <HistoryView reserve={history} />}
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        busy={remove.isPending}
        title="Excluir esta reserva?"
        description={removing ? `"${removing.name}" e todo o histórico dela serão apagados (${brlFmt(removing.current_amount)} guardados).` : ''}
        confirmLabel="Excluir"
      />
    </div>
  );
}

function ReserveFormView({ form, onDone }: { form: NonNullable<ReserveForm>; onDone: () => void }) {
  const r = form.reserve;
  const [name, setName] = useState(r?.name ?? form.preset?.name ?? '');
  const [kind, setKind] = useState<ReserveKind>(r?.kind ?? form.preset?.kind ?? 'other');
  const [target, setTarget] = useState(r?.target_amount ?? 0);
  const [initial, setInitial] = useState(0);
  const [error, setError] = useState('');
  const save = useAction(
    () => (r ? api.updateReserve(r.id, { name: name.trim(), kind, target_amount: target }) : api.addReserve({ name: name.trim(), kind, target_amount: target, current_amount: initial })),
    { success: r ? 'Reserva atualizada.' : 'Reserva criada.', onSuccess: onDone },
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Dê um nome para a reserva.');
        setError('');
        save.mutate(undefined);
      }}
    >
      <Field label="Nome" error={error}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Reserva de Emergência" maxLength={60} autoFocus />}
      </Field>
      <Field label="Tipo">
        {(p) => (
          <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as ReserveKind)}>
            {(Object.keys(RESERVE_KIND_LABEL) as ReserveKind[]).map((k) => (
              <option key={k} value={k}>
                {RESERVE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Meta (quanto quer juntar)" hint="Dica para emergência: comece com 1 mês de renda e vá aumentando até 3 a 6 meses.">
        {(p) => <CurrencyInput {...p} value={target} onChange={setTarget} />}
      </Field>
      {!r && (
        <Field label="Já tem algo guardado? (opcional)">{(p) => <CurrencyInput {...p} value={initial} onChange={setInitial} />}</Field>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}

function MoveForm({ reserve, type: initialType, onDone }: { reserve: Reserve; type: 'deposit' | 'withdraw'; onDone: () => void }) {
  const members = useMembers();
  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState(0);
  const [memberId, setMemberId] = useState<string>('');
  const [date, setDate] = useState(todayBR());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = useAction(api.addReserveTx.bind(null, reserve.id), {
    success: type === 'deposit' ? 'Valor guardado. Parabéns! 🎉' : 'Retirada registrada.',
    onSuccess: onDone,
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount <= 0) return setError('Informe o valor.');
        if (type === 'withdraw' && amount > reserve.current_amount) return setError(`Só há ${brlFmt(reserve.current_amount)} guardados.`);
        setError('');
        save.mutate({ type, amount, member_id: memberId ? Number(memberId) : null, date, note: note.trim() || undefined });
      }}
    >
      <Segmented
        label="Tipo de movimentação"
        value={type}
        onChange={setType}
        options={[
          { value: 'deposit', label: 'Guardar' },
          { value: 'withdraw', label: 'Retirar' },
        ]}
      />
      <Field label="Valor" error={error}>
        {(p) => <CurrencyInput {...p} value={amount} onChange={setAmount} autoFocus />}
      </Field>
      <Field label={type === 'deposit' ? 'Quem guardou?' : 'Quem retirou?'}>
        {(p) => (
          <Select {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Não informar</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data">{(p) => <Input {...p} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Observação (opcional)">{(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} />}</Field>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : type === 'deposit' ? 'Guardar' : 'Retirar'}
        </Button>
      </div>
    </form>
  );
}

function HistoryView({ reserve }: { reserve: Reserve }) {
  const q = useQuery({ queryKey: ['reserve-tx', reserve.id, reserve.current_amount], queryFn: () => api.reserveTx(reserve.id) });
  const del = useAction((txId: number) => api.deleteReserveTx(reserve.id, txId), { success: 'Movimentação desfeita.' });
  if (q.isPending) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!q.data?.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>;
  return (
    <ul className="divide-y">
      {q.data.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5">
          {t.type === 'deposit' ? <ArrowDownCircle className="size-5 shrink-0 text-good" aria-hidden /> : <ArrowUpCircle className="size-5 shrink-0 text-danger" aria-hidden />}
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">
              {t.type === 'deposit' ? 'Guardou' : 'Retirou'} {t.member_name ? `· ${t.member_name}` : ''}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {fullDate(t.date)}
              {t.note ? ` · ${t.note}` : ''}
            </p>
          </div>
          <p className={`tabular text-sm font-bold ${t.type === 'deposit' ? 'text-good' : 'text-danger'}`}>
            {t.type === 'deposit' ? '+' : '−'} {brlFmt(t.amount)}
          </p>
          <Button variant="danger-ghost" size="icon" aria-label="Desfazer movimentação" onClick={() => del.mutate(t.id)} disabled={del.isPending}>
            <Trash2 className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
