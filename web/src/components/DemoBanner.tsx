import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAction } from '@/lib/queries';
import type { User } from '@/lib/types';

export function DemoBanner({ user, onClaim }: { user: User; onClaim: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const clear = useAction(api.clearDemo, { success: 'Pronto! Tudo limpo — comece cadastrando quem mora na casa.', onSuccess: () => setConfirm(false) });

  if (!user.has_demo_data && !user.is_guest) return null;
  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-accent p-3 text-accent-foreground sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="text-sm">
            {user.has_demo_data ? (
              <>
                <p className="font-semibold">Você está no modo demonstração (dados de exemplo)</p>
                <p className="opacity-90">Estes dados não ficam salvos no banco: ao recarregar a página, o exemplo volta ao estado inicial. Para salvar de verdade, crie sua conta.</p>
              </>
            ) : (
              <p className="font-semibold">Você está testando em memória. Recarregar a página restaura o exemplo inicial — crie sua conta para salvar no banco.</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
          {user.has_demo_data && (
            <Button onClick={() => setConfirm(true)} className="whitespace-normal text-center">
              Limpar dados de exemplo e começar do zero
            </Button>
          )}
          {user.is_guest && (
            <Button variant="outline" onClick={onClaim}>
              Criar minha conta
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => clear.mutate(undefined)}
        busy={clear.isPending}
        title="Começar do zero?"
        description="Isso limpa os dados de exemplo apenas nesta visualização para você testar do zero. Se recarregar a página, o exemplo inicial volta."
        confirmLabel="Sim, limpar tudo"
      />
    </div>
  );
}
