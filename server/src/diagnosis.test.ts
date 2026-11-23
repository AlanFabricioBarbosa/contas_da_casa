import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnosis, type DiagnosisInput } from './diagnosis.js';
import { CATEGORIES, type Category } from './constants.js';

const zero = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;

const base = (over: Partial<DiagnosisInput> = {}): DiagnosisInput => ({
  today: '2026-11-23',
  month: '2026-11',
  incomeTotal: 3000,
  hasMembers: true,
  expensesTotal: 0,
  expenseCount: 0,
  allPaid: false,
  byCategory: zero(),
  variableByCategory: zero(),
  prevVariableByCategory: zero(),
  prevDebt: 0,
  members: [],
  overdue: { count: 0, amount: 0, titles: [] },
  earlierOverdueCount: 0,
  dueSoon: { count: 0, amount: 0 },
  reserves: { depositedMonth: 0, emergencyDepositedMonth: 0, reachedGoals: [] },
  ...over,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test('gastos acima da renda → alerta com quanto falta', () => {
  const d = buildDiagnosis(base({ expensesTotal: 3500, expenseCount: 3 }));
  const deficit = d.critical.find((i) => i.id === 'deficit');
  assert.ok(deficit);
  assert.match(deficit.title, /500,00/);
  assert.ok(!ids(d.good).includes('no-azul'));
});

test('moradia + contas básicas acima de 45% → alerta; 45% exato não alerta', () => {
  const over = buildDiagnosis(base({ byCategory: { ...zero(), moradia: 1000, contas_basicas: 400 }, expensesTotal: 1400, expenseCount: 2 }));
  assert.ok(ids(over.critical).includes('moradia-contas'));
  const exact = buildDiagnosis(base({ byCategory: { ...zero(), moradia: 1000, contas_basicas: 350 }, expensesTotal: 1350, expenseCount: 2 }));
  assert.ok(!ids(exact.critical).includes('moradia-contas'));
});

test('contas atrasadas e pessoa no negativo', () => {
  const d = buildDiagnosis(
    base({
      overdue: { count: 2, amount: 300, titles: ['Luz', 'Água'] },
      members: [
        { name: 'Ana', income: 1500, owes: 1700, free: -200 },
        { name: 'Beto', income: 1500, owes: 1000, free: 500 },
      ],
    }),
  );
  assert.ok(ids(d.critical).includes('atrasadas'));
  const neg = d.critical.find((i) => i.id.startsWith('pessoa-negativa'));
  assert.ok(neg);
  assert.match(neg.title, /Ana/);
  assert.match(neg.tip ?? '', /Beto/);
});

test('atenção: categoria variável que mais cresceu e 0% de reserva', () => {
  const d = buildDiagnosis(
    base({
      variableByCategory: { ...zero(), alimentacao: 900, lazer: 200 },
      prevVariableByCategory: { ...zero(), alimentacao: 800, lazer: 50 },
    }),
  );
  const top = d.attention.find((i) => i.id === 'variavel-cresceu');
  assert.ok(top);
  assert.match(top.title, /Lazer/);
  assert.ok(ids(d.attention).includes('sem-reserva'));
});

test('lazer > 10% com reserva zerada gera a sugestão combinada', () => {
  const d = buildDiagnosis(base({ byCategory: { ...zero(), lazer: 400 }, expensesTotal: 400, expenseCount: 1 }));
  const lazer = d.attention.find((i) => i.id === 'lazer-alto');
  assert.ok(lazer);
  assert.match(lazer.title, /reserva está zerada/);
});

test('positivo: no azul, metas, reserva de emergência e dívidas menores', () => {
  const d = buildDiagnosis(
    base({
      expensesTotal: 2000,
      expenseCount: 5,
      allPaid: true,
      byCategory: { ...zero(), moradia: 900, alimentacao: 700, dividas: 100 },
      prevDebt: 200,
      reserves: { depositedMonth: 150, emergencyDepositedMonth: 150, reachedGoals: [] },
    }),
  );
  assert.deepEqual(
    ids(d.good).sort(),
    ['dividas-menores', 'moradia-alimentacao-ok', 'no-azul', 'reserva-emergencia', 'tudo-pago'].sort(),
  );
  assert.ok(!ids(d.attention).includes('sem-reserva'));
});

test('sem renda cadastrada orienta o usuário', () => {
  const d = buildDiagnosis(base({ incomeTotal: 0, hasMembers: false }));
  assert.deepEqual(ids(d.critical), ['sem-renda']);
  assert.equal(d.good.length, 0);
});
