import { all, get, insert, run, type Db } from './db.js';
import { calcSplits, type SplitMember } from './money.js';
import { dateInMonth, daysInMonth } from './dates.js';
import type { ExpenseStatus, ExpenseType, SplitMode } from './constants.js';

export interface ExpenseRow {
  id: number;
  user_id: number;
  month_year: string;
  title: string;
  amount: number;
  category: string;
  type: ExpenseType;
  split_mode: SplitMode;
  status: ExpenseStatus;
  due_date: string;
}

export interface MemberRow {
  id: number;
  user_id: number;
  name: string;
  monthly_income: number;
}

export async function listMembers(db: Db, userId: number): Promise<MemberRow[]> {
  return all<MemberRow>(db, 'SELECT * FROM household_members WHERE user_id = ? ORDER BY id', userId);
}

export function toSplitMembers(rows: MemberRow[]): SplitMember[] {
  return rows.map((m) => ({ id: m.id, income: m.monthly_income }));
}

export async function replaceSplits(
  db: Db,
  expenseId: number,
  mode: SplitMode,
  amount: number,
  members: SplitMember[],
) {
  await run(db, 'DELETE FROM expense_splits WHERE expense_id = ?', expenseId);
  for (const s of calcSplits(mode, amount, members)) {
    await run(
      db,
      'INSERT INTO expense_splits (expense_id, member_id, assigned_amount) VALUES (?,?,?)',
      expenseId,
      s.member_id,
      s.assigned_amount,
    );
  }
}

/**
 * Recalcula a divisão de gastos "igual" e "proporcional" usando as rendas atuais
 * (chamar quando uma renda mudar ou uma pessoa for removida). Gastos individuais
 * sem dono (pessoa removida) são apagados.
 */
export async function rebuildSplits(db: Db, userId: number) {
  await run(
    db,
    `DELETE FROM expenses WHERE user_id = ? AND id NOT IN (SELECT DISTINCT expense_id FROM expense_splits)`,
    userId,
  );
  const incomes = new Map((await listMembers(db, userId)).map((m) => [m.id, m.monthly_income]));
  const expenses = await all<ExpenseRow>(
    db,
    `SELECT * FROM expenses WHERE user_id = ? AND split_mode IN ('equal','proportional')`,
    userId,
  );
  for (const e of expenses) {
    const ids = (
      await all<{ member_id: number }>(
        db,
        'SELECT member_id FROM expense_splits WHERE expense_id = ? ORDER BY member_id',
        e.id,
      )
    ).map((r) => r.member_id);
    await replaceSplits(
      db,
      e.id,
      e.split_mode,
      e.amount,
      ids.map((id) => ({ id, income: incomes.get(id) ?? 0 })),
    );
  }
}

/**
 * Copia os gastos fixos de `from` para `to` (status pendente, mesmo dia de vencimento).
 * Ignora os que já existem no mês de destino (mesmo nome e categoria).
 */
export async function duplicateFixed(db: Db, userId: number, from: string, to: string) {
  const members = new Map((await listMembers(db, userId)).map((m) => [m.id, m]));
  const source = await all<ExpenseRow>(
    db,
    `SELECT * FROM expenses WHERE user_id = ? AND month_year = ? AND type = 'fixed' ORDER BY id`,
    userId,
    from,
  );
  let copied = 0;
  let skipped = 0;
  for (const e of source) {
    const exists = await get(
      db,
      `SELECT 1 AS x FROM expenses WHERE user_id = ? AND month_year = ? AND title = ? AND category = ? AND type = 'fixed'`,
      userId,
      to,
      e.title,
      e.category,
    );
    if (exists) {
      skipped++;
      continue;
    }
    const ids = (
      await all<{ member_id: number }>(
        db,
        'SELECT member_id FROM expense_splits WHERE expense_id = ? ORDER BY member_id',
        e.id,
      )
    )
      .map((r) => r.member_id)
      .filter((id) => members.has(id));
    if (ids.length === 0) continue;

    const day = Number(e.due_date.slice(8, 10));
    const id = await insert(
      db,
      `INSERT INTO expenses (user_id, month_year, title, amount, category, type, split_mode, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      userId,
      to,
      e.title,
      e.amount,
      e.category,
      e.type,
      e.split_mode,
      'pending',
      dateInMonth(to, Math.min(day, daysInMonth(to))),
    );
    await replaceSplits(
      db,
      id,
      e.split_mode,
      e.amount,
      ids.map((mid) => ({ id: mid, income: members.get(mid)!.monthly_income })),
    );
    copied++;
  }
  return { copied, skipped, found: source.length };
}
