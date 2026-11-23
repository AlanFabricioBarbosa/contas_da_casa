import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { ThemeToggle } from '@/lib/theme';
import { Footer } from '@/components/Footer';
import { VerifyCodeForm } from '@/components/VerifyCodeForm';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { errMsg } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { resetSession } from '@/lib/session';

export default function AuthPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        const user = await api.login({ email: form.email, password: form.password });
        resetSession(qc, user);
      } else {
        const res = await api.register(form);
        setPendingEmail(res.email);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const startDemo = async () => {
    setBusy(true);
    setError('');
    try {
      const user = await api.guest();
      resetSession(qc, user);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="absolute right-3 top-3">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground" aria-hidden>
            R$
          </span>
          <h1 className="mt-4 text-2xl font-bold">Contas da Casa</h1>
          <p className="mt-1 text-muted-foreground">Clareza para fechar o mês no azul e montar sua reserva.</p>
        </div>

        <Button size="lg" className="mb-4 w-full" onClick={startDemo} disabled={busy}>
          <Sparkles className="size-5" /> Testar agora com dados de exemplo
        </Button>

        <Card className="p-5">
          {pendingEmail ? (
            <VerifyCodeForm
              email={pendingEmail}
              onVerified={(user) => resetSession(qc, user)}
              onBack={() => {
                setPendingEmail(null);
                setError('');
              }}
            />
          ) : resetting ? (
            <ResetPasswordForm
              initialEmail={form.email}
              onDone={(user) => {
                resetSession(qc, user);
                toast('Senha alterada! Você já está conectado.');
              }}
              onBack={() => {
                setResetting(false);
                setError('');
              }}
            />
          ) : (
            <>
              <div role="tablist" className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1">
                {(['login', 'register'] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    type="button"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setError('');
                    }}
                    className={cn('cursor-pointer rounded-md py-2 text-sm font-medium transition-colors', mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground')}
                  >
                    {m === 'login' ? 'Entrar' : 'Criar conta'}
                  </button>
                ))}
              </div>

              <form className="flex flex-col gap-4" onSubmit={submitForm}>
                {mode === 'register' && (
                  <Field label="Seu nome">{(p) => <Input {...p} required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
                )}
                <Field label="E-mail">{(p) => <Input {...p} type="email" required autoComplete="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}</Field>
                <Field label="Senha" hint={mode === 'register' ? 'Mínimo de 8 caracteres.' : undefined}>
                  {(p) => (
                    <Input
                      {...p}
                      type="password"
                      required
                      minLength={mode === 'register' ? 8 : undefined}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  )}
                </Field>
                {error && (
                  <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={busy}>
                  {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Enviar código e criar conta'}
                </Button>
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setResetting(true);
                      setError('');
                    }}
                    className="mx-auto cursor-pointer text-xs font-medium text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Enviamos um código de verificação para confirmar seu e-mail. Sua conta começa zerada e salva no banco.
                  </p>
                )}
              </form>
            </>
          )}
        </Card>
        <Footer className="mt-6 border-t-0 pt-0" />
      </div>
    </div>
  );
}

function ResetPasswordForm({
  initialEmail,
  onDone,
  onBack,
}: {
  initialEmail: string;
  onDone: (user: Awaited<ReturnType<typeof api.resetPassword>>) => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await api.forgotPassword({ email });
      setSent(true);
      setInfo('Se este e-mail estiver cadastrado, enviamos um código de 6 dígitos para ele (confira também o Spam).');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setError('Digite os 6 números do código enviado para o seu e-mail.');
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const user = await api.resetPassword({ email, code: digits, new_password: newPassword });
      onDone(user);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg bg-accent p-3 text-sm text-accent-foreground">
        <KeyRound className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Recuperar senha</p>
          <p className="opacity-90">
            {sent ? `Digite o código enviado para ${email} e escolha uma senha nova.` : 'Informe seu e-mail para receber o código de 6 dígitos.'}
          </p>
        </div>
      </div>

      {!sent ? (
        <form className="flex flex-col gap-4" onSubmit={sendCode}>
          <Field label="Seu e-mail">
            {(p) => <Input {...p} type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </Field>
          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar código'}
          </Button>
          <button type="button" onClick={onBack} disabled={busy} className="mx-auto cursor-pointer text-xs text-muted-foreground hover:underline">
            Voltar para o login
          </button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={confirmReset}>
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
          <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
            {(p) => (
              <Input
                {...p}
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
            {busy ? 'Salvando…' : 'Salvar nova senha e entrar'}
          </Button>
          <div className="flex items-center justify-between gap-2 text-xs">
            <button type="button" onClick={() => sendCode()} disabled={busy} className="cursor-pointer font-medium text-primary hover:underline disabled:opacity-50">
              Reenviar código
            </button>
            <button type="button" onClick={onBack} disabled={busy} className="cursor-pointer text-muted-foreground hover:underline">
              Voltar para o login
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
