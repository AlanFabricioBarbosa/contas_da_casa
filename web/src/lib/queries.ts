import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import { useToast } from '@/components/ui/toast';

export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: api.members });
export const useSummary = (month: string) => useQuery({ queryKey: ['summary', month], queryFn: () => api.summary(month) });
export const useExpenses = (month: string) => useQuery({ queryKey: ['expenses', month], queryFn: () => api.expenses(month) });
export const useReserves = () => useQuery({ queryKey: ['reserves'], queryFn: api.reserves });

export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Algo deu errado. Tente de novo.');

/** Mutação que atualiza todas as telas e mostra aviso de sucesso/erro. */
export function useAction<TArgs, TRes>(fn: (a: TArgs) => Promise<TRes>, opts?: { success?: string | ((r: TRes) => string); onSuccess?: (r: TRes) => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (r) => {
      await qc.invalidateQueries();
      const msg = typeof opts?.success === 'function' ? opts.success(r) : opts?.success;
      if (msg) toast(msg);
      opts?.onSuccess?.(r);
    },
    onError: (e) => toast(errMsg(e), 'error'),
  });
}
