import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAction } from '@/lib/queries';

export function ClaimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const claim = useAction(api.claim, { success: 'Conta criada! Seus dados foram guardados.', onSuccess: onClose });
  return (
    <Dialog open={open} onClose={onClose} title="Criar minha conta" description="Seus dados atuais continuam salvos, agora com e-mail e senha.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          claim.mutate(form);
        }}
      >
        <Field label="Seu nome">{(p) => <Input {...p} required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
        <Field label="E-mail">{(p) => <Input {...p} type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          {(p) => <Input {...p} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <Button type="submit" disabled={claim.isPending}>
          {claim.isPending ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
    </Dialog>
  );
}
