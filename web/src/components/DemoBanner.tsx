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
                <p className="font-semibold">Você está vendo dados de exemplo</p>
                <p className="opacity-90">Um casal com 1 salário mínimo cada. Mexa à vontade — e quando quiser, comece com os seus números.</p>
              </>
            ) : (
              <p className="font-semibold">Você está usando como visitante. Crie uma conta para não perder seus dados.</p>
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
        description="Vamos apagar todas as pessoas, gastos e reservas de exemplo. Depois você cadastra os seus. Isso não pode ser desfeito."
        confirmLabel="Sim, limpar tudo"
      />
    </div>
  );
}
