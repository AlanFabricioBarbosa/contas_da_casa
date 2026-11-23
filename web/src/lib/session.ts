import type { QueryClient } from '@tanstack/react-query';
import type { User } from './types';

/** Troca o usuário logado (ou desloga com null) sem derrubar a consulta "me" que a tela observa. */
export function resetSession(qc: QueryClient, user: User | null) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  qc.setQueryData(['me'], user);
}
