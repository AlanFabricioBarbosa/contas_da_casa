import { useState } from 'react';
import { Clock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { CurrencyInput, Field, Input } from '@/components/ui/field';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { brlFmt, formatDateTime, pctFmt } from '@/lib/format';
import { useAction, useMembers } from '@/lib/queries';
import type { Member } from '@/lib/types';
import { EmptyState, PageHeader, Skeleton } from './shared';

export default function MembersPage() {
  const q = useMembers();
  const [form, setForm] = useState<Member | 'new' | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const remove = useAction(api.deleteMember, { success: 'Pessoa removida.', onSuccess: () => setRemoving(null) });

  const members = q.data ?? [];
  const total = members.reduce((a, m) => a + m.monthly_income, 0);

  return (
    <div>
      <PageHeader
        title="Pessoas da casa"
        description="Quem mora com você e quanto cada um ganha por mês (salário líquido, o que cai na conta)."
        actions={
          <Button onClick={() => setForm('new')}>
            <Plus className="size-4" /> Adicionar pessoa
          </Button>
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
          <Card className="mb-4 flex items-center gap-3 border-primary/30 bg-accent p-4 text-accent-foreground">
            <Users className="size-6" aria-hidden />
            <div>
              <p className="text-sm">Renda Total da Casa</p>
              <p className="tabular text-2xl font-bold">{brlFmt(total)}</p>
            </div>
          </Card>
          <ul className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => {
              const share = total > 0 ? m.monthly_income / total : 1 / members.length;
              return (
                <li key={m.id}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{m.name}</p>
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
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Participação na renda da casa</span>
                      <span className="tabular font-semibold">{pctFmt(share)}</span>
                    </div>
                    <Progress className="mt-1.5" value={share * 100} label={`${m.name} representa ${pctFmt(share)} da renda`} />
                    {(m.updated_at || m.created_at) && (
                      <p className="mt-2.5 flex items-center gap-1 text-[11px] text-muted-foreground/80">
                        <Clock className="size-3 shrink-0" aria-hidden />
                        {m.updated_at ? `Atualizado em ${formatDateTime(m.updated_at)}` : `Cadastrado em ${formatDateTime(m.created_at)}`}
                      </p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <MemberDialog member={form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        busy={remove.isPending}
        title={`Remover ${removing?.name ?? ''}?`}
        description="Os gastos que eram só dessa pessoa serão apagados, e os divididos serão redistribuídos entre os outros. Os aportes dela nas reservas continuam, sem nome."
        confirmLabel="Remover"
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
      <Field label="Renda líquida mensal" hint="O que realmente cai na conta, já com os descontos. Pode deixar zero se a pessoa não tem renda.">
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
