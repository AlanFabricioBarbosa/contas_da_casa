import { all, get, type Db } from './db.js';
import { CATEGORIES, type Category } from './constants.js';
import { addDays, prevMonth } from './dates.js';
import { buildDiagnosis, type Diagnosis } from './diagnosis.js';
import { fromCents, toCents } from './money.js';
import { listMembers } from './expenses.js';

const zeroByCat = (): Record<Category, number> =>
  Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

export interface Summary {
  month: string;
  today: string;
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
    income_share: number;
    owes: number;
    owes_paid: number;
    owes_pending: number;
    free: number;
  }[];
  categories: { category: Category; total: number; share_of_expenses: number; share_of_income: number }[];
  diagnosis: Diagnosis;
}

export function buildSummary(db: Db, userId: number, month: string, today: string): Summary {
  const members = listMembers(db, userId);
  const incomeCents = members.reduce((a, m) => a + toCents(m.monthly_income), 0);

  const expenses = all<{
    id: number;
    title: string;
    amount: number;
    category: Category;
    type: 'fixed' | 'variable';
    status: 'paid' | 'pending';
    due_date: string;
  }>(
    db,
    `SELECT id, title, amount, category, type, status, due_date FROM expenses WHERE user_id = ? AND month_year = ?`,
    userId,
    month,
  );
  const prevExpenses = all<{ amount: number; category: Category; type: 'fixed' | 'variable' }>(
    db,
    `SELECT amount, category, type FROM expenses WHERE user_id = ? AND month_year = ?`,
    userId,
    prevMonth(month),
  );

  let totalC = 0;
  let paidC = 0;
  const byCatC = zeroByCat();
  const varC = zeroByCat();
  for (const e of expenses) {
    const c = toCents(e.amount);
    totalC += c;
    if (e.status === 'paid') paidC += c;
    byCatC[e.category] = (byCatC[e.category] ?? 0) + c;
    if (e.type === 'variable') varC[e.category] = (varC[e.category] ?? 0) + c;
  }
  const prevVarC = zeroByCat();
  let prevDebtC = 0;
  for (const e of prevExpenses) {
    const c = toCents(e.amount);
    if (e.category === 'dividas') prevDebtC += c;
    if (e.type === 'variable') prevVarC[e.category] = (prevVarC[e.category] ?? 0) + c;
  }

  // Quanto cada pessoa paga
  const splitRows = all<{ member_id: number; assigned_amount: number; status: 'paid' | 'pending' }>(
    db,
    `SELECT s.member_id, s.assigned_amount, e.status
       FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
      WHERE e.user_id = ? AND e.month_year = ?`,
    userId,
    month,
  );
  const owes = new Map<number, { total: number; paid: number }>();
  for (const r of splitRows) {
    const o = owes.get(r.member_id) ?? { total: 0, paid: 0 };
    const c = toCents(r.assigned_amount);
    o.total += c;
    if (r.status === 'paid') o.paid += c;
    owes.set(r.member_id, o);
  }
  const memberSummaries = members.map((m) => {
    const o = owes.get(m.id) ?? { total: 0, paid: 0 };
    const inc = toCents(m.monthly_income);
    return {
      id: m.id,
      name: m.name,
      monthly_income: m.monthly_income,
      income_share: incomeCents > 0 ? inc / incomeCents : members.length ? 1 / members.length : 0,
      owes: fromCents(o.total),
      owes_paid: fromCents(o.paid),
      owes_pending: fromCents(o.total - o.paid),
      free: fromCents(inc - o.total),
    };
  });

  // Reservas
  const reserves = all<{ id: number; name: string; kind: string; target_amount: number; current_amount: number }>(
    db,
    'SELECT id, name, kind, target_amount, current_amount FROM reserves WHERE user_id = ?',
    userId,
  );
  const reservesTotalC = reserves.reduce((a, r) => a + toCents(r.current_amount), 0);
  const tx = all<{ type: 'deposit' | 'withdraw'; amount: number; kind: string }>(
    db,
    `SELECT t.type, t.amount, r.kind FROM reserve_transactions t JOIN reserves r ON r.id = t.reserve_id
      WHERE r.user_id = ? AND t.date >= ? AND t.date <= ?`,
    userId,
    `${month}-01`,
    `${month}-31`,
  );
  let depC = 0;
  let wdC = 0;
  let emergDepC = 0;
  for (const t of tx) {
    const c = toCents(t.amount);
    if (t.type === 'deposit') {
      depC += c;
      if (t.kind === 'emergency') emergDepC += c;
    } else wdC += c;
  }

  // Contas atrasadas / a vencer
  const overdueItems = expenses.filter((e) => e.status === 'pending' && e.due_date < today);
  const soonLimit = addDays(today, 5);
  const dueSoon = expenses.filter((e) => e.status === 'pending' && e.due_date >= today && e.due_date <= soonLimit);
  const earlier = get<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM expenses WHERE user_id = ? AND month_year < ? AND status = 'pending' AND due_date < ?`,
    userId,
    month,
    today,
  );

  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, fromCents(byCatC[c])])) as Record<Category, number>;
  const diagnosis = buildDiagnosis({
    today,
    month,
    incomeTotal: fromCents(incomeCents),
    hasMembers: members.length > 0,
    expensesTotal: fromCents(totalC),
    expenseCount: expenses.length,
    allPaid: expenses.length > 0 && expenses.every((e) => e.status === 'paid'),
    byCategory,
    variableByCategory: Object.fromEntries(CATEGORIES.map((c) => [c, fromCents(varC[c])])) as Record<Category, number>,
    prevVariableByCategory: Object.fromEntries(CATEGORIES.map((c) => [c, fromCents(prevVarC[c])])) as Record<
      Category,
      number
    >,
    prevDebt: fromCents(prevDebtC),
    members: memberSummaries.map((m) => ({ name: m.name, income: m.monthly_income, owes: m.owes, free: m.free })),
    overdue: {
      count: overdueItems.length,
      amount: fromCents(overdueItems.reduce((a, e) => a + toCents(e.amount), 0)),
      titles: overdueItems.map((e) => e.title),
    },
    earlierOverdueCount: earlier?.n ?? 0,
    dueSoon: {
      count: dueSoon.length,
      amount: fromCents(dueSoon.reduce((a, e) => a + toCents(e.amount), 0)),
    },
    reserves: {
      depositedMonth: fromCents(depC),
      emergencyDepositedMonth: fromCents(emergDepC),
      reachedGoals: reserves.filter((r) => r.target_amount > 0 && r.current_amount >= r.target_amount).map((r) => r.name),
    },
  });

  return {
    month,
    today,
    income_total: fromCents(incomeCents),
    expenses_total: fromCents(totalC),
    paid_total: fromCents(paidC),
    pending_total: fromCents(totalC - paidC),
    balance: fromCents(incomeCents - totalC),
    reserves_total: fromCents(reservesTotalC),
    reserves_deposited_month: fromCents(depC),
    reserves_withdrawn_month: fromCents(wdC),
    savings_rate: incomeCents > 0 ? depC / incomeCents : 0,
    overdue_count: overdueItems.length,
    members: memberSummaries,
    categories: CATEGORIES.map((c) => ({
      category: c,
      total: fromCents(byCatC[c]),
      share_of_expenses: totalC > 0 ? byCatC[c] / totalC : 0,
      share_of_income: incomeCents > 0 ? byCatC[c] / incomeCents : 0,
    })),
    diagnosis,
  };
}
