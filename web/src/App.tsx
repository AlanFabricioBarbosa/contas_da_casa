import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthorizedHandler } from './lib/api';
import AuthPage from './pages/AuthPage';
import Layout from './components/Layout';
import { Loader2 } from 'lucide-react';
import { resetSession } from './lib/session';

export default function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false, staleTime: Infinity });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      resetSession(qc, null);
    });
  }, [qc]);

  if (me.isPending) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status">
        <Loader2 className="size-8 animate-spin" aria-label="Carregando" />
      </div>
    );
  }
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-medium">Não foi possível conectar ao servidor.</p>
          <p className="mt-1 text-sm text-muted-foreground">Verifique se o servidor está rodando e tente de novo.</p>
          <button className="mt-4 rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={() => me.refetch()}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
  if (!me.data) return <AuthPage />;
  return <Layout user={me.data} />;
}
