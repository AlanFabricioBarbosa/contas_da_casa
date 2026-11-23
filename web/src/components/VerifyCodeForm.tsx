import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/queries';
import type { User } from '@/lib/types';

export function VerifyCodeForm({
  email,
  onVerified,
  onBack,
}: {
  email: string;
  onVerified: (user: User) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setError('Digite os 6 números do código enviado para o seu e-mail.');
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const user = await api.verifyEmail({ email, code: digits });
      onVerified(user);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await api.resendCode({ email });
      setInfo('Novo código enviado! Confira sua caixa de entrada e o Spam.');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex items-start gap-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
        <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Confirme seu e-mail</p>
          <p className="opacity-90">
            Enviamos um código de 6 dígitos para <strong>{email}</strong>. Se não achar, olhe no Spam.
          </p>
        </div>
      </div>

      <Field label="Código de 6 dígitos">
        {(p) => (
          <Input
            {...p}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            className="tabular text-center text-xl font-bold tracking-[0.35em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
          />
        )}
      </Field>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          {info}
        </p>
      )}

      <Button type="submit" disabled={busy}>
        {busy ? 'Confirmando…' : 'Confirmar e criar conta'}
      </Button>

      <div className="flex items-center justify-between gap-2 text-xs">
        <button type="button" onClick={resend} disabled={busy} className="cursor-pointer font-medium text-primary hover:underline disabled:opacity-50">
          Reenviar código
        </button>
        <button type="button" onClick={onBack} disabled={busy} className="cursor-pointer text-muted-foreground hover:underline">
          Alterar e-mail
        </button>
      </div>
    </form>
  );
}
