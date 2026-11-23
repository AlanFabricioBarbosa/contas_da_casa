import { demoStore, enterDemoMode, exitDemoMode, isDemoMode } from './demo-store';
import type { Expense, ExpenseInput, ExpenseStatus, ExtraIncome, ExtraIncomeInput, Member, Reserve, ReserveKind, ReserveTx, Summary, Tag, User } from './types';

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
  me: () => (isDemoMode() ? demoStore.me() : get<User>('/auth/me')),
  login: async (b: { email: string; password: string }) => {
    const u = await post<User>('/auth/login', b);
    exitDemoMode();
    return u;
  },
  register: async (b: { name: string; email: string; password: string }) => {
    const u = await post<User>('/auth/register', b);
    exitDemoMode();
    return u;
  },
  guest: async () => enterDemoMode(),
  logout: () => (isDemoMode() ? demoStore.logout() : post<{ ok: true }>('/auth/logout')),

  clearDemo: () => (isDemoMode() ? demoStore.clearDemo() : post<{ ok: true }>('/demo/clear')),

  summary: (month: string) => (isDemoMode() ? demoStore.summary(month) : get<Summary>(`/summary?month=${month}`)),

  members: () => (isDemoMode() ? demoStore.members() : get<Member[]>('/members')),
  addMember: (b: Pick<Member, 'name' | 'monthly_income'>) => (isDemoMode() ? demoStore.addMember(b) : post<Member>('/members', b)),
  updateMember: (id: number, b: Pick<Member, 'name' | 'monthly_income'>) =>
    isDemoMode() ? demoStore.updateMember(id, b) : put<Member>(`/members/${id}`, b),
  deleteMember: (id: number) => (isDemoMode() ? demoStore.deleteMember(id) : del(`/members/${id}`)),

  extraIncomes: (month: string) => (isDemoMode() ? demoStore.extraIncomes(month) : get<ExtraIncome[]>(`/extra-incomes?month=${month}`)),
  addExtraIncome: (b: ExtraIncomeInput) => (isDemoMode() ? demoStore.addExtraIncome(b) : post<ExtraIncome>('/extra-incomes', b)),
  updateExtraIncome: (id: number, b: ExtraIncomeInput) =>
    isDemoMode() ? demoStore.updateExtraIncome(id, b) : put<ExtraIncome>(`/extra-incomes/${id}`, b),
  deleteExtraIncome: (id: number) => (isDemoMode() ? demoStore.deleteExtraIncome(id) : del(`/extra-incomes/${id}`)),

  expenses: (month: string) => (isDemoMode() ? demoStore.expenses(month) : get<Expense[]>(`/expenses?month=${month}`)),
  addExpense: (b: ExpenseInput) =>
    isDemoMode() ? demoStore.addExpense(b) : post<Expense & { created_count?: number }>('/expenses', b),
  updateExpense: (id: number, b: ExpenseInput) =>
    isDemoMode() ? demoStore.updateExpense(id, b) : put<Expense>(`/expenses/${id}`, b),
  setExpenseStatus: (id: number, status: ExpenseStatus) =>
    isDemoMode() ? demoStore.setExpenseStatus(id, status) : patch<Expense>(`/expenses/${id}/status`, { status }),
  deleteExpense: (id: number, all = false) =>
    isDemoMode() ? demoStore.deleteExpense(id, all) : del<{ ok: true; deleted?: number }>(`/expenses/${id}${all ? '?all=1' : ''}`),
  duplicateFixed: (to: string, from?: string) =>
    isDemoMode()
      ? demoStore.duplicateFixed(to, from)
      : post<{ copied: number; skipped: number; found: number; from: string; to: string }>('/expenses/duplicate-fixed', { to, from }),

  tags: () => (isDemoMode() ? demoStore.tags() : get<Tag[]>('/tags')),
  addTag: (b: Pick<Tag, 'name' | 'category' | 'default_amount'>) => (isDemoMode() ? demoStore.addTag(b) : post<Tag>('/tags', b)),
  updateTag: (id: number, b: Pick<Tag, 'name' | 'category' | 'default_amount'>) =>
    isDemoMode() ? demoStore.updateTag(id, b) : put<Tag>(`/tags/${id}`, b),
  deleteTag: (id: number) => (isDemoMode() ? demoStore.deleteTag(id) : del(`/tags/${id}`)),

  reserves: () => (isDemoMode() ? demoStore.reserves() : get<Reserve[]>('/reserves')),
  addReserve: (b: { name: string; kind: ReserveKind; target_amount: number; current_amount: number }) =>
    isDemoMode() ? demoStore.addReserve(b) : post<Reserve>('/reserves', b),
  updateReserve: (id: number, b: { name: string; kind: ReserveKind; target_amount: number }) =>
    isDemoMode() ? demoStore.updateReserve(id, b) : put<Reserve>(`/reserves/${id}`, b),
  deleteReserve: (id: number) => (isDemoMode() ? demoStore.deleteReserve(id) : del(`/reserves/${id}`)),
  reserveTx: (id: number) => (isDemoMode() ? demoStore.reserveTx(id) : get<ReserveTx[]>(`/reserves/${id}/transactions`)),
  addReserveTx: (id: number, b: { type: 'deposit' | 'withdraw'; amount: number; member_id: number | null; date: string; note?: string }) =>
    isDemoMode() ? demoStore.addReserveTx(id, b) : post<Reserve>(`/reserves/${id}/transactions`, b),
  deleteReserveTx: (id: number, txId: number) =>
    isDemoMode() ? demoStore.deleteReserveTx(id, txId) : del(`/reserves/${id}/transactions/${txId}`),
};
