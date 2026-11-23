import { insert, run, tx, type Db } from './db.js';
import { currentMonth, dateInMonth, prevMonth } from './dates.js';
import { replaceSplits } from './expenses.js';
import type { Category, ExpenseType, SplitMode } from './constants.js';

/** Salário mínimo de 2026 (R$ 1.621,00) — exemplo realista para o modo demonstração. */
const SALARIO_MINIMO = 1621;

interface DemoExpense {
  title: string;
  amount: number;
  category: Category;
  type: ExpenseType;
  split: SplitMode;
  /** índice da pessoa (individual) */
  who?: 0 | 1;
  day: number;
}

/**
 * Cria um exemplo: casal com 1 salário mínimo cada, dividindo aluguel e contas.
 * O mês atual fecha "no azul", mas com alguns alertas, para mostrar o Consultor em ação.
 */
export async function seedDemo(db: Db, userId: number, today: string) {
  await tx(db, async (tdb) => {
    const eu = await insert(tdb, 'INSERT INTO household_members (user_id, name, monthly_income) VALUES (?,?,?)', userId, 'Eu', SALARIO_MINIMO);
    const conj = await insert(tdb, 'INSERT INTO household_members (user_id, name, monthly_income) VALUES (?,?,?)', userId, 'Cônjuge', SALARIO_MINIMO);
    const people = [
      { id: eu, income: SALARIO_MINIMO },
      { id: conj, income: SALARIO_MINIMO },
    ];

    const month = currentMonth(today);
    const prev = prevMonth(month);
    const todayDay = Number(today.slice(8, 10));

    const fixed = (m: 'now' | 'prev'): DemoExpense[] => [
      { title: 'Aluguel', amount: 1100, category: 'moradia', type: 'fixed', split: 'proportional', day: 5 },
      { title: 'Conta de luz', amount: m === 'now' ? 140 : 128, category: 'contas_basicas', type: 'fixed', split: 'equal', day: 12 },
      { title: 'Conta de água', amount: m === 'now' ? 70 : 66, category: 'contas_basicas', type: 'fixed', split: 'equal', day: 15 },
      { title: 'Internet', amount: 100, category: 'contas_basicas', type: 'fixed', split: 'equal', day: 5 },
      { title: 'Gás de cozinha', amount: 110, category: 'contas_basicas', type: 'variable', split: 'equal', day: 18 },
      { title: 'Parcela do empréstimo', amount: m === 'now' ? 180 : 230, category: 'dividas', type: 'fixed', split: 'individual', who: 1, day: 20 },
      { title: 'Passagens (ônibus)', amount: 300, category: 'transporte', type: 'fixed', split: 'individual', who: 1, day: 1 },
    ];
    const variable = (m: 'now' | 'prev'): DemoExpense[] => [
      { title: 'Mercado do mês', amount: m === 'now' ? 850 : 780, category: 'alimentacao', type: 'variable', split: 'equal', day: 8 },
      { title: 'Farmácia', amount: 90, category: 'saude', type: 'variable', split: 'individual', who: 0, day: 10 },
      { title: 'Lazer e extras', amount: m === 'now' ? 150 : 60, category: 'lazer', type: 'variable', split: 'individual', who: 0, day: 14 },
    ];

    const addList = async (monthStr: string, list: DemoExpense[], isPrev: boolean) => {
      for (const e of list) {
        const due = dateInMonth(monthStr, e.day);
        // No mês atual: o que já venceu está pago — menos a internet, "esquecida" para mostrar o alerta de atraso.
        const paid = isPrev || (e.day < todayDay && e.title !== 'Internet');
        const id = await insert(
          tdb,
          `INSERT INTO expenses (user_id, month_year, title, amount, category, type, split_mode, status, due_date)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          userId, monthStr, e.title, e.amount, e.category, e.type, e.split, paid ? 'paid' : 'pending', due,
        );
        const members = e.split === 'individual' ? [people[e.who ?? 0]!] : people;
        await replaceSplits(tdb, id, e.split, e.amount, members);
      }
    };
    await addList(prev, [...fixed('prev'), ...variable('prev')], true);
    await addList(month, [...fixed('now'), ...variable('now')], false);

    // Tags (atalhos do dia a dia) e alguns gastinhos já lançados hoje
    const tagDefs: { name: string; category: Category; amount: number }[] = [
      { name: 'Uber / 99', category: 'transporte', amount: 15 },
      { name: 'Lanche na rua', category: 'alimentacao', amount: 12.5 },
      { name: 'Padaria', category: 'alimentacao', amount: 10 },
      { name: 'Farmácia', category: 'saude', amount: 0 },
      { name: 'Lazer / sorvete', category: 'lazer', amount: 0 },
    ];
    for (const t of tagDefs) {
      await run(tdb, 'INSERT INTO expense_tags (user_id, name, category, default_amount) VALUES (?,?,?,?)', userId, t.name, t.category, t.amount);
    }
    const quick: { tag: string; amount: number; category: Category; who: 0 | 1 }[] = [
      { tag: 'Uber / 99', amount: 24.9, category: 'transporte', who: 1 },
      { tag: 'Lanche na rua', amount: 12.5, category: 'alimentacao', who: 0 },
    ];
    for (const q of quick) {
      const id = await insert(
        tdb,
        `INSERT INTO expenses (user_id, month_year, title, amount, category, type, frequency, split_mode, status, due_date, tag)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        userId, month, q.tag, q.amount, q.category, 'variable', 'daily', 'individual', 'paid', today, q.tag,
      );
      await replaceSplits(tdb, id, 'individual', q.amount, [people[q.who]!]);
    }

    // Reservas
    const reserve = (name: string, kind: string, target: number, current: number) =>
      insert(tdb, 'INSERT INTO reserves (user_id, name, kind, target_amount, current_amount) VALUES (?,?,?,?,?)', userId, name, kind, target, current);
    const emergencia = await reserve('Reserva de Emergência', 'emergency', SALARIO_MINIMO * 3, 450);
    const anuais = await reserve('Contas Anuais / IPTU', 'annual', 600, 150);
    await reserve('Meta Pessoal: celular novo', 'goal', 900, 120);

    // Aporte do mês passado (o mês atual ainda está sem depósito → o Consultor avisa)
    await run(tdb, 'INSERT INTO reserve_transactions (reserve_id, member_id, amount, type, date, note) VALUES (?,?,?,?,?,?)', emergencia, eu, 100, 'deposit', dateInMonth(prev, 6), 'Sobra do mês');
    await run(tdb, 'INSERT INTO reserve_transactions (reserve_id, member_id, amount, type, date, note) VALUES (?,?,?,?,?,?)', anuais, conj, 50, 'deposit', dateInMonth(prev, 7), null);

    await run(tdb, 'UPDATE users SET has_demo_data = 1 WHERE id = ?', userId);
  });
}

export async function clearUserData(db: Db, userId: number) {
  await tx(db, async (tdb) => {
    await run(tdb, 'DELETE FROM expenses WHERE user_id = ?', userId);
    await run(tdb, 'DELETE FROM reserves WHERE user_id = ?', userId);
    await run(tdb, 'DELETE FROM expense_tags WHERE user_id = ?', userId);
    await run(tdb, 'DELETE FROM household_members WHERE user_id = ?', userId);
    await run(tdb, 'UPDATE users SET has_demo_data = 0 WHERE id = ?', userId);
  });
}
