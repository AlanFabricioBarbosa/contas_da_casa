import { CATEGORY_INFO, CATEGORY_ORDER } from './categories';
import { LIMITS_REF } from './demo-limits';
import { brlFmt, daysInMonth, pctFmt, shiftMonth, todayBR } from './format';
import { previewSplit } from './split';
import type {
  Category,
  Expense,
  ExpenseFrequency,
  ExpenseInput,
  ExpenseStatus,
  ExtraIncome,
  ExtraIncomeInput,
  Insight,
  Member,
  Reserve,
  ReserveKind,
  ReserveTx,
  Summary,
  Tag,
  User,
} from './types';

const DEMO_KEY = 'modo_demo';
const SALARIO_MINIMO = 1621;

export const isDemoMode = () => {
  try {
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
};

export function enterDemoMode(): User {
  try {
    sessionStorage.setItem(DEMO_KEY, '1');
  } catch {
    /* ignore */
  }
  state = createInitialState();
  return { ...state.user };
}

export function exitDemoMode() {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignore */
  }
}

const toCents = (v: number) => Math.round(v * 100);
const fromCents = (c: number) => Math.round(c) / 100;

function allocate(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count);
  const rest = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => (i < rest ? base + 1 : base));
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dateInMonth(month: string, day: number): string {
  return `${month}-${String(Math.min(Math.max(1, day), daysInMonth(month))).padStart(2, '0')}`;
}

interface StoredReserve extends Omit<Reserve, 'contributions'> {
  transactions: ReserveTx[];
}

interface DemoState {
  nextId: number;
  user: User;
  members: Member[];
  extraIncomes: ExtraIncome[];
  expenses: Expense[];
  tags: Tag[];
  reserves: StoredReserve[];
}

function calcSplits(mode: Expense['split_mode'], amount: number, members: Member[]) {
  return previewSplit(mode, amount, members).map((p) => ({ member_id: p.member.id, assigned_amount: p.value }));
}

function createInitialState(): DemoState {
  const today = todayBR();
  const month = today.slice(0, 7);
  const prev = shiftMonth(month, -1);
  const todayDay = Number(today.slice(8, 10));
  const nowIso = new Date().toISOString();
  let seq = 1;
  const id = () => seq++;

  const eu: Member = { id: id(), name: 'Eu', monthly_income: SALARIO_MINIMO, created_at: nowIso };
  const conj: Member = { id: id(), name: 'Cônjuge', monthly_income: SALARIO_MINIMO, created_at: nowIso };
  const people = [eu, conj];

  const makeExp = (
    mStr: string,
    opts: {
      title: string;
      amount: number;
      category: Category;
      type: 'fixed' | 'variable';
      frequency: ExpenseFrequency;
      split: Expense['split_mode'];
      who?: 0 | 1;
      day?: number;
      dueDate?: string;
      paid: boolean;
      tag?: string | null;
    },
  ): Expense => {
    const due = opts.dueDate ?? dateInMonth(mStr, opts.day ?? 10);
    const chosen = opts.split === 'individual' ? [people[opts.who ?? 0]!] : people;
    return {
      id: id(),
      month_year: due.slice(0, 7),
      title: opts.title,
      amount: opts.amount,
      category: opts.category,
      type: opts.type,
      frequency: opts.frequency,
      split_mode: opts.split,
      status: opts.paid ? 'paid' : 'pending',
      due_date: due,
      tag: opts.tag ?? null,
      installment_group: null,
      installment_num: null,
      installment_total: null,
      created_at: nowIso,
      splits: calcSplits(opts.split, opts.amount, chosen),
    };
  };

  const buildMonth = (mStr: string, isPrev: boolean): Expense[] => {
    const list: Omit<Parameters<typeof makeExp>[1], 'paid'>[] = [
      { title: 'Aluguel', amount: 1100, category: 'moradia', type: 'fixed', frequency: 'monthly', split: 'proportional', day: 5 },
      { title: 'Conta de luz', amount: isPrev ? 128 : 140, category: 'contas_basicas', type: 'fixed', frequency: 'monthly', split: 'equal', day: 12 },
      { title: 'Conta de água', amount: isPrev ? 66 : 70, category: 'contas_basicas', type: 'fixed', frequency: 'monthly', split: 'equal', day: 15 },
      { title: 'Internet', amount: 100, category: 'contas_basicas', type: 'fixed', frequency: 'monthly', split: 'equal', day: 5 },
      { title: 'Gás de cozinha', amount: 110, category: 'contas_basicas', type: 'variable', frequency: 'monthly', split: 'equal', day: 18 },
      { title: 'Parcela do empréstimo', amount: isPrev ? 230 : 180, category: 'dividas', type: 'fixed', frequency: 'monthly', split: 'individual', who: 1, day: 20 },
      { title: 'Passagens (ônibus)', amount: 300, category: 'transporte', type: 'fixed', frequency: 'monthly', split: 'individual', who: 1, day: 1 },
      { title: 'Mercado do mês', amount: isPrev ? 780 : 850, category: 'alimentacao', type: 'variable', frequency: 'monthly', split: 'equal', day: 8 },
      { title: 'Farmácia', amount: 90, category: 'saude', type: 'variable', frequency: 'monthly', split: 'individual', who: 0, day: 10 },
      { title: 'Lazer e extras', amount: isPrev ? 60 : 150, category: 'lazer', type: 'variable', frequency: 'monthly', split: 'individual', who: 0, day: 14 },
    ];
    return list.map((e) => makeExp(mStr, { ...e, paid: isPrev || ((e.day ?? 10) < todayDay && e.title !== 'Internet') }));
  };

  const expenses: Expense[] = [
    ...buildMonth(prev, true),
    ...buildMonth(month, false),
    makeExp(month, { title: 'Uber / 99', amount: 24.9, category: 'transporte', type: 'variable', frequency: 'daily', split: 'individual', who: 1, dueDate: today, paid: true, tag: 'Uber / 99' }),
    makeExp(month, { title: 'Lanche na rua', amount: 12.5, category: 'alimentacao', type: 'variable', frequency: 'daily', split: 'individual', who: 0, dueDate: today, paid: true, tag: 'Lanche na rua' }),
  ];

  const tags: Tag[] = [
    { id: id(), name: 'Uber / 99', category: 'transporte', default_amount: 15, created_at: nowIso },
    { id: id(), name: 'Lanche na rua', category: 'alimentacao', default_amount: 12.5, created_at: nowIso },
    { id: id(), name: 'Padaria', category: 'alimentacao', default_amount: 10, created_at: nowIso },
    { id: id(), name: 'Farmácia', category: 'saude', default_amount: 0, created_at: nowIso },
    { id: id(), name: 'Lazer / sorvete', category: 'lazer', default_amount: 0, created_at: nowIso },
  ];

  const reserves: StoredReserve[] = [
    {
      id: id(),
      name: 'Reserva de Emergência',
      kind: 'emergency',
      target_amount: SALARIO_MINIMO * 3,
      current_amount: 450,
      created_at: nowIso,
      transactions: [
        { id: id(), amount: 100, type: 'deposit', date: dateInMonth(prev, 6), note: 'Sobra do mês', member_id: eu.id, member_name: eu.name, created_at: nowIso },
      ],
    },
    {
      id: id(),
      name: 'Contas Anuais / IPTU',
      kind: 'annual',
      target_amount: 600,
      current_amount: 150,
      created_at: nowIso,
      transactions: [
        { id: id(), amount: 50, type: 'deposit', date: dateInMonth(prev, 7), note: null, member_id: conj.id, member_name: conj.name, created_at: nowIso },
      ],
    },
    {
      id: id(),
      name: 'Meta Pessoal: celular novo',
      kind: 'goal',
      target_amount: 900,
      current_amount: 120,
      created_at: nowIso,
      transactions: [],
    },
  ];

  return {
    nextId: seq,
    user: { id: 0, name: 'Visitante', email: null, is_guest: true, has_demo_data: true },
    members: people,
    extraIncomes: [],
    expenses,
    tags,
    reserves,
  };
}

let state: DemoState = createInitialState();

function rebuildSplits() {
  const byId = new Map(state.members.map((m) => [m.id, m]));
  state.expenses = state.expenses
    .map((e) => {
      const kept = e.splits.map((s) => byId.get(s.member_id)).filter((m): m is Member => !!m);
      if (kept.length === 0) return null;
      return { ...e, splits: calcSplits(e.split_mode, e.amount, kept) };
    })
    .filter((e): e is Expense => e !== null);
}

function publicReserves(): Reserve[] {
  return state.reserves.map((r) => {
    const map = new Map<number, { member_id: number; name: string; totalC: number }>();
    for (const t of r.transactions) {
      if (t.member_id == null || !t.member_name) continue;
      const cur = map.get(t.member_id) ?? { member_id: t.member_id, name: t.member_name, totalC: 0 };
      cur.totalC += t.type === 'deposit' ? toCents(t.amount) : -toCents(t.amount);
      map.set(t.member_id, cur);
    }
    return {
      id: r.id,
      name: r.name,
      kind: r.kind,
      target_amount: r.target_amount,
      current_amount: r.current_amount,
      created_at: r.created_at,
      contributions: [...map.values()]
        .map((c) => ({ member_id: c.member_id, name: c.name, total: fromCents(c.totalC) }))
        .sort((a, b) => b.total - a.total),
    };
  });
}

function zeroByCat(): Record<Category, number> {
  return Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<Category, number>;
}

function buildSummary(month: string): Summary {
  const today = todayBR();
  const prev = shiftMonth(month, -1);
  const baseIncomeC = state.members.reduce((a, m) => a + toCents(m.monthly_income), 0);
  const extraByMember = new Map<number, number>();
  let extraIncomeC = 0;
  for (const x of state.extraIncomes) {
    if (x.month_year !== month) continue;
    const c = toCents(x.amount);
    extraIncomeC += c;
    extraByMember.set(x.member_id, (extraByMember.get(x.member_id) ?? 0) + c);
  }
  const incomeC = baseIncomeC + extraIncomeC;
  const monthExps = state.expenses.filter((e) => e.month_year === month);
  const prevExps = state.expenses.filter((e) => e.month_year === prev);

  let totalC = 0;
  let paidC = 0;
  const byCatC = zeroByCat();
  const varC = zeroByCat();
  const byFreq = { daily: { cents: 0, count: 0 }, weekly: { cents: 0, count: 0 }, monthly: { cents: 0, count: 0 } };
  const owes = new Map<number, { total: number; paid: number }>();

  for (const e of monthExps) {
    const c = toCents(e.amount);
    totalC += c;
    if (e.status === 'paid') paidC += c;
    byCatC[e.category] += c;
    if (e.type === 'variable') varC[e.category] += c;
    byFreq[e.frequency].cents += c;
    byFreq[e.frequency].count += 1;
    for (const s of e.splits) {
      const o = owes.get(s.member_id) ?? { total: 0, paid: 0 };
      const sc = toCents(s.assigned_amount);
      o.total += sc;
      if (e.status === 'paid') o.paid += sc;
      owes.set(s.member_id, o);
    }
  }

  const prevVarC = zeroByCat();
  let prevDebtC = 0;
  for (const e of prevExps) {
    const c = toCents(e.amount);
    if (e.category === 'dividas') prevDebtC += c;
    if (e.type === 'variable') prevVarC[e.category] += c;
  }

  const memberSummaries = state.members.map((m) => {
    const o = owes.get(m.id) ?? { total: 0, paid: 0 };
    const inc = toCents(m.monthly_income);
    const ext = extraByMember.get(m.id) ?? 0;
    return {
      id: m.id,
      name: m.name,
      monthly_income: m.monthly_income,
      extra_income: fromCents(ext),
      total_income: fromCents(inc + ext),
      income_share: baseIncomeC > 0 ? inc / baseIncomeC : state.members.length ? 1 / state.members.length : 0,
      owes: fromCents(o.total),
      owes_paid: fromCents(o.paid),
      owes_pending: fromCents(o.total - o.paid),
      free: fromCents(inc + ext - o.total),
    };
  });

  const reservesTotalC = state.reserves.reduce((a, r) => a + toCents(r.current_amount), 0);
  let depC = 0;
  let wdC = 0;
  let emergDepC = 0;
  for (const r of state.reserves) {
    for (const t of r.transactions) {
      if (t.date.slice(0, 7) !== month) continue;
      const c = toCents(t.amount);
      if (t.type === 'deposit') {
        depC += c;
        if (r.kind === 'emergency') emergDepC += c;
      } else {
        wdC += c;
      }
    }
  }

  const tagMap = new Map<string, { cents: number; count: number; last_at: string | null }>();
  for (const e of monthExps) {
    if (!e.tag) continue;
    const cur = tagMap.get(e.tag) ?? { cents: 0, count: 0, last_at: null };
    cur.cents += toCents(e.amount);
    cur.count += 1;
    if (!cur.last_at || e.created_at > cur.last_at) cur.last_at = e.created_at;
    tagMap.set(e.tag, cur);
  }
  const tagsSummary = [...tagMap.entries()]
    .map(([name, v]) => ({ name, total: fromCents(v.cents), count: v.count, last_at: v.last_at }))
    .sort((a, b) => b.total - a.total);

  const overdueItems = monthExps.filter((e) => e.status === 'pending' && e.due_date < today);
  const soonLimit = addDays(today, 5);
  const dueSoon = monthExps.filter((e) => e.status === 'pending' && e.due_date >= today && e.due_date <= soonLimit);
  const earlierOverdue = state.expenses.filter((e) => e.month_year < month && e.status === 'pending' && e.due_date < today).length;

  const income = fromCents(incomeC);
  const expensesTotal = fromCents(totalC);
  const balance = fromCents(incomeC - totalC);
  const byCat = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, fromCents(byCatC[c])])) as Record<Category, number>;
  const pct = (v: number) => (income > 0 ? v / income : 0);

  const critical: Insight[] = [];
  const attention: Insight[] = [];
  const good: Insight[] = [];

  if (state.members.length === 0 || income <= 0) {
    critical.push({
      id: 'sem-renda',
      severity: 'critical',
      title: 'Ainda não há renda cadastrada',
      message: 'Sem saber quanto entra por mês, não consigo dizer se o dinheiro vai dar.',
      tip: 'Vá na aba "Pessoas" e informe o salário líquido (o que cai na conta) de cada morador.',
    });
  }
  if (income > 0 && expensesTotal > income) {
    critical.push({
      id: 'deficit',
      severity: 'critical',
      title: `Faltam ${brlFmt(expensesTotal - income)} para fechar o mês`,
      message: `Os gastos (${brlFmt(expensesTotal)}) passam da renda da casa (${brlFmt(income)}).`,
      tip: 'Comece cortando o que é variável (lazer, comida fora de casa, extras).',
    });
  }
  const hb = byCat.moradia + byCat.contas_basicas;
  if (income > 0 && pct(hb) > LIMITS_REF.housingAndBills) {
    critical.push({
      id: 'moradia-contas',
      severity: 'critical',
      title: `Moradia + Contas Básicas consomem ${pctFmt(pct(hb))} da renda`,
      message: `São ${brlFmt(hb)} de ${brlFmt(income)}. O ideal é ficar até ${pctFmt(LIMITS_REF.housingAndBills)}; passou ${brlFmt(hb - income * LIMITS_REF.housingAndBills)}.`,
      tip: 'Veja onde dá para aliviar: trocar plano de internet/celular, pedir tarifa social de luz ou reduzir consumo.',
    });
  }
  if (overdueItems.length > 0) {
    const amt = fromCents(overdueItems.reduce((a, e) => a + toCents(e.amount), 0));
    critical.push({
      id: 'atrasadas',
      severity: 'critical',
      title: `${overdueItems.length} ${overdueItems.length === 1 ? 'conta atrasada' : 'contas atrasadas'} (${brlFmt(amt)})`,
      message: `Atrasadas: ${overdueItems.slice(0, 4).map((e) => e.title).join(', ')}.`,
      tip: 'Atraso gera multa e juros. Pague primeiro o que pode cortar serviço (luz, água).',
    });
  }
  if (earlierOverdue > 0) {
    critical.push({
      id: 'atrasadas-antigas',
      severity: 'critical',
      title: `${earlierOverdue} ${earlierOverdue === 1 ? 'conta' : 'contas'} de meses anteriores ainda pendente(s)`,
      message: 'Elas continuam sem o status "Pago" e já passaram do vencimento.',
      tip: 'Se já pagou, marque como "Pago" na aba Gastos.',
    });
  }
  const positives = memberSummaries.filter((m) => m.free > 0).sort((a, b) => b.free - a.free);
  for (const m of memberSummaries.filter((x) => x.free < -0.005)) {
    const helper = positives[0];
    critical.push({
      id: `pessoa-negativa-${m.name}`,
      severity: 'critical',
      title: `${m.name} está no vermelho: faltam ${brlFmt(-m.free)}`,
      message: `${m.name} recebe ${brlFmt(m.monthly_income)} mas ficou com ${brlFmt(m.owes)} de contas para pagar.`,
      tip: helper
        ? `${helper.name} fica com ${brlFmt(helper.free)} de sobra. Reveja a divisão dos gastos.`
        : 'Reveja a divisão dos gastos entre as pessoas.',
    });
  }

  let topVar: { cat: Category; growth: number; prev: number; now: number } | null = null;
  for (const c of CATEGORY_ORDER) {
    const now = fromCents(varC[c]);
    const p = fromCents(prevVarC[c]);
    const g = now - p;
    if (p > 0 && g >= 1 && (!topVar || g > topVar.growth)) topVar = { cat: c, growth: g, prev: p, now };
  }
  if (topVar) {
    attention.push({
      id: 'variavel-cresceu',
      severity: 'attention',
      title: `${CATEGORY_INFO[topVar.cat].label} foi o gasto variável que mais subiu`,
      message: `Foi de ${brlFmt(topVar.prev)} para ${brlFmt(topVar.now)} (+${brlFmt(topVar.growth)} que no mês passado).`,
      tip: 'Defina um teto semanal para essa categoria.',
    });
  }
  const noReserve = depC <= 0;
  if (income > 0 && pct(byCat.lazer) > LIMITS_REF.leisure) {
    attention.push({
      id: 'lazer-alto',
      severity: 'attention',
      title: noReserve ? 'Lazer/extras passaram de 10% e a reserva está zerada' : 'Lazer/extras passaram de 10% da renda',
      message: `Você gastou ${brlFmt(byCat.lazer)} (${pctFmt(pct(byCat.lazer))} da renda).`,
      tip: noReserve ? 'Mova parte do lazer para a reserva assim que o dinheiro entrar.' : 'Vale rever os gastos extras.',
    });
  }
  if (income > 0 && noReserve) {
    const sug = income * LIMITS_REF.suggestedSavings;
    attention.push({
      id: 'sem-reserva',
      severity: 'attention',
      title: 'Nada foi guardado na reserva (0% da renda)',
      message: balance > 0 ? `Sobraram ${brlFmt(balance)} no mês, mas nada foi para a reserva.` : 'Neste mês não sobrou dinheiro para guardar.',
      tip: balance > 0 ? `Guarde pelo menos ${brlFmt(Math.min(balance, sug))} assim que receber.` : `Mesmo ${brlFmt(20)} já cria o hábito.`,
    });
  }
  if (dueSoon.length > 0) {
    const amt = fromCents(dueSoon.reduce((a, e) => a + toCents(e.amount), 0));
    attention.push({
      id: 'vencendo',
      severity: 'attention',
      title: `${dueSoon.length} ${dueSoon.length === 1 ? 'conta vence' : 'contas vencem'} nos próximos 5 dias`,
      message: `Total de ${brlFmt(amt)} para pagar em breve.`,
    });
  }

  if (income > 0 && monthExps.length > 0 && balance >= 0) {
    good.push({
      id: 'no-azul',
      severity: 'good',
      title: balance > 0 ? `Mês no azul: sobram ${brlFmt(balance)}` : 'Mês fechando certinho',
      message: `A renda (${brlFmt(income)}) cobre todos os gastos (${brlFmt(expensesTotal)}).`,
    });
  }
  if (income > 0 && byCat.moradia > 0 && pct(byCat.moradia) <= LIMITS_REF.housing && byCat.alimentacao > 0 && pct(byCat.alimentacao) <= LIMITS_REF.food) {
    good.push({
      id: 'moradia-alimentacao-ok',
      severity: 'good',
      title: 'Moradia e alimentação dentro da meta',
      message: `Moradia em ${pctFmt(pct(byCat.moradia))} e alimentação em ${pctFmt(pct(byCat.alimentacao))}.`,
    });
  }
  if (emergDepC > 0) {
    good.push({
      id: 'reserva-emergencia',
      severity: 'good',
      title: `Você guardou ${brlFmt(fromCents(emergDepC))} na reserva de emergência`,
      message: 'Esse colchão protege a família quando surge um imprevisto!',
    });
  } else if (depC > 0) {
    good.push({
      id: 'reserva-deposito',
      severity: 'good',
      title: `Você guardou ${brlFmt(fromCents(depC))} neste mês`,
      message: 'Guardar com constância é o que faz a reserva crescer.',
    });
  }
  const prevDebt = fromCents(prevDebtC);
  if (prevDebt > 0 && byCat.dividas < prevDebt) {
    good.push({
      id: 'dividas-menores',
      severity: 'good',
      title: `Dívidas caíram ${brlFmt(prevDebt - byCat.dividas)}`,
      message: `Foram de ${brlFmt(prevDebt)} para ${brlFmt(byCat.dividas)} em relação ao mês anterior.`,
    });
  }
  if (monthExps.length > 0 && monthExps.every((e) => e.status === 'paid')) {
    good.push({ id: 'tudo-pago', severity: 'good', title: 'Todas as contas do mês estão pagas', message: 'Nada pendente!' });
  }
  if (extraIncomeC > 0) {
    good.push({
      id: 'renda-extra',
      severity: 'good',
      title: `Você ganhou ${brlFmt(fromCents(extraIncomeC))} de renda extra no mês`,
      message: 'Esse dinheiro a mais ajuda a aliviar as contas ou reforçar a reserva sem depender só da renda padrão.',
    });
  }

  return {
    month,
    today,
    base_income_total: fromCents(baseIncomeC),
    extra_income_total: fromCents(extraIncomeC),
    income_total: income,
    expenses_total: expensesTotal,
    paid_total: fromCents(paidC),
    pending_total: fromCents(totalC - paidC),
    balance,
    reserves_total: fromCents(reservesTotalC),
    reserves_deposited_month: fromCents(depC),
    reserves_withdrawn_month: fromCents(wdC),
    savings_rate: incomeC > 0 ? depC / incomeC : 0,
    overdue_count: overdueItems.length,
    members: memberSummaries,
    categories: CATEGORY_ORDER.map((c) => ({
      category: c,
      total: byCat[c],
      share_of_expenses: totalC > 0 ? byCatC[c] / totalC : 0,
      share_of_income: incomeC > 0 ? byCatC[c] / incomeC : 0,
    })),
    by_frequency: {
      daily: { total: fromCents(byFreq.daily.cents), count: byFreq.daily.count },
      weekly: { total: fromCents(byFreq.weekly.cents), count: byFreq.weekly.count },
      monthly: { total: fromCents(byFreq.monthly.cents), count: byFreq.monthly.count },
    },
    tags: tagsSummary,
    diagnosis: { critical, attention, good },
  };
}

export const demoStore = {
  me: async (): Promise<User> => ({ ...state.user }),
  logout: async () => {
    exitDemoMode();
    return { ok: true as const };
  },
  clearDemo: async () => {
    state.members = [];
    state.extraIncomes = [];
    state.expenses = [];
    state.reserves = [];
    state.tags = [];
    state.user = { ...state.user, has_demo_data: false };
    return { ok: true as const };
  },

  summary: async (month: string) => buildSummary(month),

  members: async () => [...state.members],
  addMember: async (b: Pick<Member, 'name' | 'monthly_income'>) => {
    const m: Member = { id: state.nextId++, name: b.name, monthly_income: b.monthly_income, created_at: new Date().toISOString() };
    state.members.push(m);
    return m;
  },
  updateMember: async (id: number, b: Pick<Member, 'name' | 'monthly_income'>) => {
    const m = state.members.find((x) => x.id === id);
    if (!m) throw new Error('Pessoa não encontrada.');
    m.name = b.name;
    m.monthly_income = b.monthly_income;
    m.updated_at = new Date().toISOString();
    rebuildSplits();
    return { ...m };
  },
  deleteMember: async (id: number) => {
    state.members = state.members.filter((x) => x.id !== id);
    state.extraIncomes = state.extraIncomes.filter((x) => x.member_id !== id);
    rebuildSplits();
    return { ok: true };
  },

  extraIncomes: async (month: string) =>
    state.extraIncomes
      .filter((x) => x.month_year === month)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id),

  addExtraIncome: async (b: ExtraIncomeInput) => {
    const m = state.members.find((x) => x.id === b.member_id);
    if (!m) throw new Error('Pessoa não encontrada.');
    const item: ExtraIncome = {
      id: state.nextId++,
      member_id: m.id,
      member_name: m.name,
      month_year: b.date.slice(0, 7),
      title: b.title,
      amount: b.amount,
      date: b.date,
      created_at: new Date().toISOString(),
    };
    state.extraIncomes.push(item);
    return item;
  },

  updateExtraIncome: async (id: number, b: ExtraIncomeInput) => {
    const item = state.extraIncomes.find((x) => x.id === id);
    const m = state.members.find((x) => x.id === b.member_id);
    if (!item || !m) throw new Error('Renda extra não encontrada.');
    item.member_id = m.id;
    item.member_name = m.name;
    item.month_year = b.date.slice(0, 7);
    item.title = b.title;
    item.amount = b.amount;
    item.date = b.date;
    return { ...item };
  },

  deleteExtraIncome: async (id: number) => {
    state.extraIncomes = state.extraIncomes.filter((x) => x.id !== id);
    return { ok: true };
  },

  expenses: async (month: string) =>
    state.expenses.filter((e) => e.month_year === month).sort((a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id),

  addExpense: async (b: ExpenseInput): Promise<Expense & { created_count?: number }> => {
    const chosen = state.members.filter((m) => b.member_ids.includes(m.id));
    const n = b.installments && b.installments > 1 ? b.installments : 1;
    const nowIso = new Date().toISOString();
    if (n === 1) {
      const e: Expense = {
        id: state.nextId++,
        month_year: b.due_date.slice(0, 7),
        title: b.title,
        amount: b.amount,
        category: b.category,
        type: b.type,
        frequency: b.frequency ?? 'monthly',
        split_mode: b.split_mode,
        status: b.status,
        due_date: b.due_date,
        tag: b.tag ?? null,
        installment_group: null,
        installment_num: null,
        installment_total: null,
        created_at: nowIso,
        splits: calcSplits(b.split_mode, b.amount, chosen),
      };
      state.expenses.push(e);
      return { ...e, created_count: 1 };
    }
    const group = `demo-${state.nextId++}`;
    const centsList =
      b.installment_amount_mode === 'installment'
        ? Array<number>(n).fill(toCents(b.amount))
        : allocate(toCents(b.amount), n);
    const freq: ExpenseFrequency = b.frequency === 'weekly' ? 'weekly' : 'monthly';
    const startMonth = b.due_date.slice(0, 7);
    const startDay = Number(b.due_date.slice(8, 10));
    let first!: Expense;
    for (let k = 0; k < n; k++) {
      const due = freq === 'weekly' ? addDays(b.due_date, k * 7) : dateInMonth(shiftMonth(startMonth, k), startDay);
      const amt = fromCents(centsList[k]!);
      const e: Expense = {
        id: state.nextId++,
        month_year: due.slice(0, 7),
        title: b.title,
        amount: amt,
        category: b.category,
        type: 'variable',
        frequency: freq,
        split_mode: b.split_mode,
        status: k === 0 ? b.status : 'pending',
        due_date: due,
        tag: b.tag ?? null,
        installment_group: group,
        installment_num: k + 1,
        installment_total: n,
        created_at: nowIso,
        splits: calcSplits(b.split_mode, amt, chosen),
      };
      state.expenses.push(e);
      if (k === 0) first = e;
    }
    return { ...first, created_count: n };
  },

  updateExpense: async (id: number, b: ExpenseInput) => {
    const idx = state.expenses.findIndex((x) => x.id === id);
    if (idx === -1) throw new Error('Gasto não encontrado.');
    const prev = state.expenses[idx]!;
    const chosen = state.members.filter((m) => b.member_ids.includes(m.id));
    const upd: Expense = {
      ...prev,
      month_year: b.due_date.slice(0, 7),
      title: b.title,
      amount: b.amount,
      category: b.category,
      type: b.type,
      frequency: b.frequency ?? prev.frequency,
      split_mode: b.split_mode,
      status: b.status,
      due_date: b.due_date,
      tag: b.tag ?? null,
      splits: calcSplits(b.split_mode, b.amount, chosen),
    };
    state.expenses[idx] = upd;
    return upd;
  },

  setExpenseStatus: async (id: number, status: ExpenseStatus) => {
    const e = state.expenses.find((x) => x.id === id);
    if (!e) throw new Error('Gasto não encontrado.');
    e.status = status;
    return { ...e };
  },

  deleteExpense: async (id: number, all = false) => {
    const target = state.expenses.find((x) => x.id === id);
    if (!target) throw new Error('Gasto não encontrado.');
    if (all && target.installment_group) {
      const before = state.expenses.length;
      state.expenses = state.expenses.filter((x) => x.installment_group !== target.installment_group);
      return { ok: true as const, deleted: before - state.expenses.length };
    }
    state.expenses = state.expenses.filter((x) => x.id !== id);
    return { ok: true as const, deleted: 1 };
  },

  duplicateFixed: async (to: string, fromArg?: string) => {
    const from = fromArg ?? shiftMonth(to, -1);
    const source = state.expenses.filter((e) => e.month_year === from && e.type === 'fixed' && !e.installment_group);
    let copied = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();
    for (const e of source) {
      if (state.expenses.some((x) => x.month_year === to && x.title === e.title && x.category === e.category && x.type === 'fixed')) {
        skipped++;
        continue;
      }
      const chosen = e.splits.map((s) => state.members.find((m) => m.id === s.member_id)).filter((m): m is Member => !!m);
      if (chosen.length === 0) continue;
      state.expenses.push({
        ...e,
        id: state.nextId++,
        month_year: to,
        status: 'pending',
        due_date: dateInMonth(to, Number(e.due_date.slice(8, 10))),
        created_at: nowIso,
        splits: calcSplits(e.split_mode, e.amount, chosen),
      });
      copied++;
    }
    return { copied, skipped, found: source.length, from, to };
  },

  tags: async () => [...state.tags],
  addTag: async (b: Pick<Tag, 'name' | 'category' | 'default_amount'>) => {
    if (state.tags.some((t) => t.name === b.name)) throw new Error('Você já tem uma tag com esse nome.');
    const t: Tag = { id: state.nextId++, name: b.name, category: b.category, default_amount: b.default_amount, created_at: new Date().toISOString() };
    state.tags.push(t);
    return t;
  },
  updateTag: async (id: number, b: Pick<Tag, 'name' | 'category' | 'default_amount'>) => {
    const t = state.tags.find((x) => x.id === id);
    if (!t) throw new Error('Tag não encontrada.');
    t.name = b.name;
    t.category = b.category;
    t.default_amount = b.default_amount;
    return { ...t };
  },
  deleteTag: async (id: number) => {
    state.tags = state.tags.filter((x) => x.id !== id);
    return { ok: true };
  },

  reserves: async () => publicReserves(),
  addReserve: async (b: { name: string; kind: ReserveKind; target_amount: number; current_amount: number }) => {
    const r: StoredReserve = {
      id: state.nextId++,
      name: b.name,
      kind: b.kind,
      target_amount: b.target_amount,
      current_amount: b.current_amount,
      created_at: new Date().toISOString(),
      transactions: [],
    };
    state.reserves.push(r);
    return publicReserves().find((x) => x.id === r.id)!;
  },
  updateReserve: async (id: number, b: { name: string; kind: ReserveKind; target_amount: number }) => {
    const r = state.reserves.find((x) => x.id === id);
    if (!r) throw new Error('Reserva não encontrada.');
    r.name = b.name;
    r.kind = b.kind;
    r.target_amount = b.target_amount;
    return publicReserves().find((x) => x.id === id)!;
  },
  deleteReserve: async (id: number) => {
    state.reserves = state.reserves.filter((x) => x.id !== id);
    return { ok: true };
  },
  reserveTx: async (id: number) => {
    const r = state.reserves.find((x) => x.id === id);
    if (!r) throw new Error('Reserva não encontrada.');
    return [...r.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  },
  addReserveTx: async (id: number, b: { type: 'deposit' | 'withdraw'; amount: number; member_id: number | null; date: string; note?: string }) => {
    const r = state.reserves.find((x) => x.id === id);
    if (!r) throw new Error('Reserva não encontrada.');
    if (b.type === 'withdraw' && b.amount > r.current_amount + 0.001) {
      throw new Error('Você não pode retirar mais do que há guardado nesta reserva.');
    }
    const m = b.member_id != null ? state.members.find((x) => x.id === b.member_id) : null;
    r.transactions.push({
      id: state.nextId++,
      amount: b.amount,
      type: b.type,
      date: b.date,
      note: b.note ?? null,
      member_id: m?.id ?? null,
      member_name: m?.name ?? null,
      created_at: new Date().toISOString(),
    });
    const delta = b.type === 'deposit' ? b.amount : -b.amount;
    r.current_amount = Math.max(0, fromCents(toCents(r.current_amount) + toCents(delta)));
    return publicReserves().find((x) => x.id === id)!;
  },
  deleteReserveTx: async (id: number, txId: number) => {
    const r = state.reserves.find((x) => x.id === id);
    if (!r) throw new Error('Reserva não encontrada.');
    const t = r.transactions.find((x) => x.id === txId);
    if (!t) throw new Error('Movimentação não encontrada.');
    const delta = t.type === 'deposit' ? -t.amount : t.amount;
    if (r.current_amount + delta < -0.001) throw new Error('Não dá para desfazer: o saldo da reserva ficaria negativo.');
    r.transactions = r.transactions.filter((x) => x.id !== txId);
    r.current_amount = Math.max(0, fromCents(toCents(r.current_amount) + toCents(delta)));
    return { ok: true };
  },
};
