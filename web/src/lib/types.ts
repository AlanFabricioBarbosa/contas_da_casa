export type Category = 'moradia' | 'contas_basicas' | 'alimentacao' | 'transporte' | 'saude' | 'dividas' | 'lazer';
export type ExpenseType = 'fixed' | 'variable';
export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly';
export type SplitMode = 'individual' | 'equal' | 'proportional';
export type ExpenseStatus = 'paid' | 'pending';
export type ReserveKind = 'emergency' | 'annual' | 'goal' | 'other';

export interface User {
  id: number;
  name: string;
  email: string | null;
  is_guest: boolean;
  has_demo_data: boolean;
}

export interface Member {
  id: number;
  name: string;
  monthly_income: number;
  created_at: string;
  updated_at?: string | null;
}

export interface ExtraIncome {
  id: number;
  member_id: number;
  member_name: string;
  month_year: string;
  title: string;
  amount: number;
  date: string;
  created_at: string;
}

export interface ExtraIncomeInput {
  member_id: number;
  title: string;
  amount: number;
  date: string;
}

export interface Expense {
  id: number;
  month_year: string;
  title: string;
  amount: number;
  category: Category;
  type: ExpenseType;
  frequency: ExpenseFrequency;
  split_mode: SplitMode;
  status: ExpenseStatus;
  due_date: string;
  tag: string | null;
  installment_group: string | null;
  installment_num: number | null;
  installment_total: number | null;
  created_at: string;
  splits: { member_id: number; assigned_amount: number }[];
}

export interface ExpenseInput {
  title: string;
  amount: number;
  category: Category;
  type: ExpenseType;
  frequency: ExpenseFrequency;
  split_mode: SplitMode;
  status: ExpenseStatus;
  due_date: string;
  member_ids: number[];
  tag?: string | null;
  installments?: number;
  installment_amount_mode?: 'total' | 'installment';
}

export interface Tag {
  id: number;
  name: string;
  category: Category;
  default_amount: number;
  created_at: string;
}

export interface Reserve {
  id: number;
  name: string;
  kind: ReserveKind;
  target_amount: number;
  current_amount: number;
  created_at: string;
  contributions: { member_id: number; name: string; total: number }[];
}

export interface ReserveTx {
  id: number;
  amount: number;
  type: 'deposit' | 'withdraw';
  date: string;
  note: string | null;
  member_id: number | null;
  member_name: string | null;
  created_at: string;
}

export interface Insight {
  id: string;
  severity: 'critical' | 'attention' | 'good';
  title: string;
  message: string;
  tip?: string;
}

export interface Summary {
  month: string;
  today: string;
  base_income_total: number;
  extra_income_total: number;
  income_total: number;
  expenses_total: number;
  paid_total: number;
  pending_total: number;
  balance: number;
  reserves_total: number;
  reserves_deposited_month: number;
  reserves_withdrawn_month: number;
  savings_rate: number;
  overdue_count: number;
  members: {
    id: number;
    name: string;
    monthly_income: number;
    extra_income: number;
    total_income: number;
    income_share: number;
    owes: number;
    owes_paid: number;
    owes_pending: number;
    free: number;
  }[];
  by_frequency: Record<ExpenseFrequency, { total: number; count: number }>;
  tags: { name: string; total: number; count: number; last_at: string | null }[];
  categories: { category: Category; total: number; share_of_expenses: number; share_of_income: number }[];
  diagnosis: { critical: Insight[]; attention: Insight[]; good: Insight[] };
}
