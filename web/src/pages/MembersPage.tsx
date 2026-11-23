import { useMemo, useState } from 'react';
import { Clock, Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { CurrencyInput, Field, Input, Select } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { brlFmt, daysInMonth, formatDateTime, formatShortDateTime, formatTime, fullDate, monthLabel, monthTitle, pctFmt, shortDate, todayBR } from '@/lib/format';
import { useAction, useExtraIncomes, useMembers } from '@/lib/queries';
import type { ExtraIncome, Member } from '@/lib/types';
import { EmptyState, PageHeader, Skeleton } from './shared';

type ExtraFormState = { item: ExtraIncome | null; memberId?: number } | null;

export default function MembersPage() {
  const { month } = useApp();
  const q = useMembers();
  const extraQ = useExtraIncomes(month);

  const [form, setForm] = useState<Member | 'new' | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [extraForm, setExtraForm] = useState<ExtraFormState>(null);
  const [removingExtra, setRemovingExtra] = useState<ExtraIncome | null>(null);

  const remove = useAction(api.deleteMember, { success: 'Pessoa removida.', onSuccess: () => setRemoving(null) });
  const removeExtra = useAction(api.deleteExtraIncome, { success: 'Renda extra removida.', onSuccess: () => setRemovingExtra(null) });

  const members = q.data ?? [];
  const extras = extraQ.data ?? [];

  const baseTotal = members.reduce((a, m) => a + m.monthly_income, 0);
  const extraTotal = extras.reduce((a, x) => a + x.amount, 0);
  const totalHouse = baseTotal + extraTotal;

  const extraByMember = useMemo(() => {
    const map = new Map<number, number>();
    for (const x of extras) {
      map.set(x.member_id, (map.get(x.member_id) ?? 0) + x.amount);
    }
    return map;
  }, [extras]);

  return (
    <div>
      <PageHeader
        title="Pessoas da casa"
        description="Renda padrão mensal de cada morador e rendas extras recebidas no mês."
        actions={
          <>
            {members.length > 0 && (
              <Button variant="outline" onClick={() => setExtraForm({ item: null })}>
                <Sparkles className="size-4" /> Nova renda extra
              </Button>
            )}
            <Button onClick={() => setForm('new')}>
              <Plus className="size-4" /> Adicionar pessoa
            </Button>
          </>
        }
      />

      {q.isPending ? (
        <Skeleton />
      ) : members.length === 0 ? (
        <EmptyState title="Ninguém cadastrado ainda" text="Comece por você. Depois adicione cônjuge, filhos que contribuem, mãe, etc.">
          <Button onClick={() => setForm('new')}>
            <Plus className="size-4" /> Adicionar a primeira pessoa
          </Button>
        </EmptyState>
      ) : (
        <>
          <Card className="mb-4 border-primary/30 bg-accent p-4 text-accent-foreground">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Users className="size-6 shrink-0" aria-hidden />
                <div>
                  <p className="text-sm">Renda Total da Casa em {monthLabel(month)}</p>
                  <p className="tabular text-2xl font-bold">{brlFmt(totalHouse)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="bg-card/80 text-foreground">Padrão: {brlFmt(baseTotal)}</Badge>
                <Badge tone={extraTotal > 0 ? 'good' : 'neutral'} className={extraTotal === 0 ? 'bg-card/70 text-muted-foreground' : undefined}>
                  + Extra no mês: {brlFmt(extraTotal)}
                </Badge>
              </div>
            </div>
          </Card>

          <ul className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => {
              const share = baseTotal > 0 ? m.monthly_income / baseTotal : 1 / members.length;
              const ext = extraByMember.get(m.id) ?? 0;
              const personTotal = m.monthly_income + ext;
              return (
                <li key={m.id}>
                  <Card className="flex h-full flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{m.name}</p>
                        <p className="text-xs text-muted-foreground">Renda padrão</p>
                        <p className="tabular text-xl font-bold">{brlFmt(m.monthly_income)}</p>
                      </div>
                      <div className="flex">
                        <Button variant="ghost" size="icon" aria-label={`Editar ${m.name}`} onClick={() => setForm(m)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="danger-ghost" size="icon" aria-label={`Remover ${m.name}`} onClick={() => setRemoving(m)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {ext > 0 && (
                      <div className="mt-2.5 flex items-center justify-between rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
                        <span>
                          + Renda extra ({monthLabel(month).split(' ')[0]}): <strong className="tabular">{brlFmt(ext)}</strong>
                        </span>
                        <span className="tabular font-bold">Total: {brlFmt(personTotal)}</span>
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Participação na renda padrão</span>
                      <span className="tabular font-semibold">{pctFmt(share)}</span>
                    </div>
                    <Progress className="mt-1.5" value={share * 100} label={`${m.name} representa ${pctFmt(share)} da renda padrão`} />

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      {(m.updated_at || m.created_at) ? (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                          <Clock className="size-3 shrink-0" aria-hidden />
                          {m.updated_at ? `Atualizado em ${formatDateTime(m.updated_at)}` : `Cadastrado em ${formatDateTime(m.created_at)}`}
                        </p>
                      ) : <span />}
                      <Button variant="outline" size="sm" onClick={() => setExtraForm({ item: null, memberId: m.id })}>
                        <Plus className="size-3.5" /> Renda extra
                      </Button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          <section aria-labelledby="rendas-extras" className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="rendas-extras" className="text-lg font-bold">
                  Rendas extras — {monthTitle(month)}
                </h2>
                <p className="text-sm text-muted-foreground">Bicos, horas extras, vendas ou 13º. Somam no mês sem alterar a renda padrão.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setExtraForm({ item: null })}>
                <Plus className="size-4" /> Adicionar renda extra
              </Button>
            </div>

            {extraQ.isPending ? null : extras.length === 0 ? (
              <Card className="border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhuma renda extra lançada em {monthLabel(month)}. Se entrou um dinheiro a mais, registre acima para somar no seu saldo do mês.
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {extras.map((x) => (
                  <li key={x.id}>
                    <Card className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-snug">{x.title}</p>
                          <p className="tabular shrink-0 font-bold text-good">+ {brlFmt(x.amount)}</p>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge tone="primary">{x.member_name}</Badge>
                          <Badge tone="good">Extra · {shortDate(x.date)}</Badge>
                        </div>
                        {x.created_at && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/80">
                            <Clock className="size-3 shrink-0" aria-hidden /> Lançado em {formatShortDateTime(x.created_at)}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" aria-label={`Editar ${x.title}`} onClick={() => setExtraForm({ item: x })}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button variant="danger-ghost" size="icon" aria-label={`Excluir ${x.title}`} onClick={() => setRemovingExtra(x)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <MemberDialog member={form} onClose={() => setForm(null)} />
      <Dialog
        open={!!extraForm}
        onClose={() => setExtraForm(null)}
        title={extraForm?.item ? 'Editar renda extra' : 'Nova renda extra'}
        description="Soma na renda do mês e no saldo da pessoa, mantendo a renda padrão intacta."
      >
        {extraForm && (
          <ExtraIncomeForm
            key={extraForm.item?.id ?? `new-${extraForm.memberId ?? 0}`}
            item={extraForm.item}
            defaultMemberId={extraForm.memberId}
            members={members}
            onDone={() => setExtraForm(null)}
          />
        )}
      </Dialog>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        busy={remove.isPending}
        title={`Remover ${removing?.name ?? ''}?`}
        description="Os gastos que eram só dessa pessoa (e rendas extras dela) serão apagados, e os divididos serão redistribuídos entre os outros. Os aportes dela nas reservas continuam, sem nome."
        confirmLabel="Remover"
      />
      <ConfirmDialog
        open={!!removingExtra}
        onClose={() => setRemovingExtra(null)}
        onConfirm={() => removingExtra && removeExtra.mutate(removingExtra.id)}
        busy={removeExtra.isPending}
        title="Excluir esta renda extra?"
        description={removingExtra ? `"${removingExtra.title}" (${brlFmt(removingExtra.amount)}) será removida de ${monthLabel(removingExtra.month_year)}.` : ''}
        confirmLabel="Excluir"
      />
    </div>
  );
}

function MemberDialog({ member, onClose }: { member: Member | 'new' | null; onClose: () => void }) {
  const editing = member && member !== 'new' ? member : null;
  return (
    <Dialog open={member !== null} onClose={onClose} title={editing ? 'Editar pessoa' : 'Adicionar pessoa'}>
      <MemberForm key={editing?.id ?? 'new'} member={editing} onDone={onClose} />
    </Dialog>
  );
}

function MemberForm({ member, onDone }: { member: Member | null; onDone: () => void }) {
  const [name, setName] = useState(member?.name ?? '');
  const [income, setIncome] = useState(member?.monthly_income ?? 0);
  const [error, setError] = useState('');
  const save = useAction((b: { name: string; monthly_income: number }) => (member ? api.updateMember(member.id, b) : api.addMember(b)), {
    success: member ? 'Pessoa atualizada. Divisões proporcionais foram recalculadas.' : 'Pessoa adicionada.',
    onSuccess: onDone,
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Informe o nome (ex.: Eu, Cônjuge, Mãe).');
        setError('');
        save.mutate({ name: name.trim(), monthly_income: income });
      }}
    >
      <Field label="Nome" error={error}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Eu, Cônjuge, Mãe" maxLength={40} autoFocus />}
      </Field>
      <Field label="Renda líquida padrão (mensal)" hint="O salário fixo que cai na conta todo mês. Rendas eventuais você lança como Renda extra.">
        {(p) => <CurrencyInput {...p} value={income} onChange={setIncome} />}
      </Field>
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

function ExtraIncomeForm({
  item,
  defaultMemberId,
  members,
  onDone,
}: {
  item: ExtraIncome | null;
  defaultMemberId?: number;
  members: Member[];
  onDone: () => void;
}) {
  const { month, setMonth } = useApp();
  const today = todayBR();
  const defaultDate = today.startsWith(month)
    ? today
    : `${month}-${String(Math.min(Number(today.slice(8, 10)), daysInMonth(month))).padStart(2, '0')}`;

  const [memberId, setMemberId] = useState(String(item?.member_id ?? defaultMemberId ?? members[0]?.id ?? ''));
  const [title, setTitle] = useState(item?.title ?? '');
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [date, setDate] = useState(item?.date ?? defaultDate);
  const [error, setError] = useState('');

  const save = useAction(
    () => {
      const b = { member_id: Number(memberId), title: title.trim(), amount, date };
      return item ? api.updateExtraIncome(item.id, b) : api.addExtraIncome(b);
    },
    {
      success: (saved) =>
        item
          ? 'Renda extra atualizada.'
          : `${saved.title} (+${brlFmt(saved.amount)}) para ${saved.member_name} salva em ${fullDate(saved.date)} às ${formatTime(saved.created_at)}.`,
      onSuccess: (saved) => {
        if (!item && saved.month_year !== month) setMonth(saved.month_year);
        onDone();
      },
    },
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!memberId) return setError('Escolha quem recebeu a renda extra.');
        if (!title.trim()) return setError('Informe de onde veio (ex.: Bico, Hora extra, Venda).');
        if (amount <= 0) return setError('Informe o valor da renda extra.');
        setError('');
        save.mutate(undefined);
      }}
    >
      <Field label="Quem recebeu?">
        {(p) => (
          <Select {...p} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Descrição">
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Bico fim de semana, Hora extra, Venda" maxLength={80} autoFocus />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor">{(p) => <CurrencyInput {...p} value={amount} onChange={setAmount} />}</Field>
        <Field
          label="Data"
          hint={item?.created_at ? `Lançado em ${formatShortDateTime(item.created_at)}` : `Hora do registro: ${formatTime(new Date().toISOString())}`}
        >
          {(p) => <Input {...p} type="date" required value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
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
          {save.isPending ? 'Salvando…' : 'Salvar renda extra'}
        </Button>
      </div>
    </form>
  );
}
