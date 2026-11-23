import type { Tag, Expense, ExpenseInput, ExpenseStatus, Member, Reserve, ReserveKind, ReserveTx, Summary, User } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? 'Algo deu errado. Tente de novo.');
  }
  return data as T;
}

const get = <T>(url: string) => request<T>('GET', url);
const post = <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {});
const put = <T>(url: string, body: unknown) => request<T>('PUT', url, body);
const patch = <T>(url: string, body: unknown) => request<T>('PATCH', url, body);
const del = <T>(url: string) => request<T>('DELETE', url);

export const api = {
  me: () => get<User>('/auth/me'),
  login: (b: { email: string; password: string }) => post<User>('/auth/login', b),
  register: (b: { name: string; email: string; password: string }) => post<User>('/auth/register', b),
  guest: () => post<User>('/auth/demo'),
  claim: (b: { name: string; email: string; password: string }) => post<User>('/auth/claim', b),
  logout: () => post<{ ok: true }>('/auth/logout'),

  clearDemo: () => post<{ ok: true }>('/demo/clear'),
  loadDemo: () => post<{ ok: true }>('/demo/load'),

  summary: (month: string) => get<Summary>(`/summary?month=${month}`),

  members: () => get<Member[]>('/members'),
  addMember: (b: Pick<Member, 'name' | 'monthly_income'>) => post<Member>('/members', b),
  updateMember: (id: number, b: Pick<Member, 'name' | 'monthly_income'>) => put<Member>(`/members/${id}`, b),
  deleteMember: (id: number) => del(`/members/${id}`),

  expenses: (month: string) => get<Expense[]>(`/expenses?month=${month}`),
  addExpense: (b: ExpenseInput) => post<Expense & { created_count?: number }>('/expenses', b),
  updateExpense: (id: number, b: ExpenseInput) => put<Expense>(`/expenses/${id}`, b),
  setExpenseStatus: (id: number, status: ExpenseStatus) => patch<Expense>(`/expenses/${id}/status`, { status }),
  deleteExpense: (id: number, all = false) => del<{ ok: true; deleted?: number }>(`/expenses/${id}${all ? '?all=1' : ''}`),
  duplicateFixed: (to: string, from?: string) =>
    post<{ copied: number; skipped: number; found: number; from: string; to: string }>('/expenses/duplicate-fixed', { to, from }),

  tags: () => get<Tag[]>('/tags'),
  addTag: (b: Pick<Tag, 'name' | 'category' | 'default_amount'>) => post<Tag>('/tags', b),
  updateTag: (id: number, b: Pick<Tag, 'name' | 'category' | 'default_amount'>) => put<Tag>(`/tags/${id}`, b),
  deleteTag: (id: number) => del(`/tags/${id}`),

  reserves: () => get<Reserve[]>('/reserves'),
  addReserve: (b: { name: string; kind: ReserveKind; target_amount: number; current_amount: number }) => post<Reserve>('/reserves', b),
  updateReserve: (id: number, b: { name: string; kind: ReserveKind; target_amount: number }) => put<Reserve>(`/reserves/${id}`, b),
  deleteReserve: (id: number) => del(`/reserves/${id}`),
  reserveTx: (id: number) => get<ReserveTx[]>(`/reserves/${id}/transactions`),
  addReserveTx: (id: number, b: { type: 'deposit' | 'withdraw'; amount: number; member_id: number | null; date: string; note?: string }) =>
    post<Reserve>(`/reserves/${id}/transactions`, b),
  deleteReserveTx: (id: number, txId: number) => del(`/reserves/${id}/transactions/${txId}`),
};
