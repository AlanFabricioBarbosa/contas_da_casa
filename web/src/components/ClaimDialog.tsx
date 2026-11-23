import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { VerifyCodeForm } from '@/components/VerifyCodeForm';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/queries';
import { resetSession } from '@/lib/session';
import { useToast } from '@/components/ui/toast';

export function ClaimDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.register(form);
      setPendingEmail(res.email);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        setPendingEmail(null);
        setError('');
        onClose();
      }}
      title="Criar minha conta"
      description="Saia do modo exemplo e comece sua conta salva no banco de dados."
    >
      {pendingEmail ? (
        <VerifyCodeForm
          email={pendingEmail}
          onVerified={(user) => {
            resetSession(qc, user);
            toast('Conta criada! Agora seus lançamentos ficam salvos de verdade.');
            setPendingEmail(null);
            onClose();
          }}
          onBack={() => {
            setPendingEmail(null);
            setError('');
          }}
        />
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field label="Seu nome">{(p) => <Input {...p} required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
          <Field label="E-mail">{(p) => <Input {...p} type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
          <Field label="Senha" hint="Mínimo de 8 caracteres.">
            {(p) => <Input {...p} type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando código…' : 'Enviar código e criar conta'}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
