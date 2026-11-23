import { CATEGORY_LABELS, LIMITS, type Category } from './constants.js';
import { formatBRL, formatPct } from './money.js';

export type Severity = 'critical' | 'attention' | 'good';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  message: string;
  tip?: string;
}

export interface Diagnosis {
  critical: Insight[];
  attention: Insight[];
  good: Insight[];
}

export interface DiagnosisInput {
  /** Hoje (YYYY-MM-DD) e mês analisado (YYYY-MM) */
  today: string;
  month: string;
  incomeTotal: number;
  hasMembers: boolean;
  expensesTotal: number;
  expenseCount: number;
  allPaid: boolean;
  byCategory: Record<Category, number>;
  /** Gastos do tipo "variável", por categoria, neste mês e no anterior */
  variableByCategory: Record<Category, number>;
  prevVariableByCategory: Record<Category, number>;
  prevDebt: number;
  members: { name: string; income: number; owes: number; free: number }[];
  overdue: { count: number; amount: number; titles: string[] };
  earlierOverdueCount: number;
  dueSoon: { count: number; amount: number };
  reserves: {
    depositedMonth: number;
    emergencyDepositedMonth: number;
    reachedGoals: string[];
  };
}

export function buildDiagnosis(i: DiagnosisInput): Diagnosis {
  const critical: Insight[] = [];
  const attention: Insight[] = [];
  const good: Insight[] = [];

  const income = i.incomeTotal;
  const balance = income - i.expensesTotal;
  const pct = (v: number) => (income > 0 ? v / income : 0);
  const housing = i.byCategory.moradia;
  const bills = i.byCategory.contas_basicas;
  const food = i.byCategory.alimentacao;
  const leisure = i.byCategory.lazer;
  const debt = i.byCategory.dividas;
  const noReserve = i.reserves.depositedMonth <= 0;

  /* ============ 🔴 CRÍTICO ============ */
  if (!i.hasMembers || income <= 0) {
    critical.push({
      id: 'sem-renda',
      severity: 'critical',
      title: 'Ainda não há renda cadastrada',
      message: 'Sem saber quanto entra por mês, não consigo dizer se o dinheiro vai dar.',
      tip: 'Vá na aba "Pessoas" e informe o salário líquido (o que cai na conta) de cada morador.',
    });
  }

  if (income > 0 && i.expensesTotal > income) {
    const falta = i.expensesTotal - income;
    critical.push({
      id: 'deficit',
      severity: 'critical',
      title: `Faltam ${formatBRL(falta)} para fechar o mês`,
      message: `Os gastos (${formatBRL(i.expensesTotal)}) passam da renda da casa (${formatBRL(income)}).`,
      tip: 'Comece cortando o que é variável (lazer, comida fora de casa, extras). Se a falta continuar, converse com o credor para renegociar dívidas e veja se algum gasto pode ser adiado para o mês seguinte.',
    });
  }

  const hbShare = pct(housing + bills);
  if (income > 0 && hbShare > LIMITS.housingAndBills) {
    const excess = housing + bills - income * LIMITS.housingAndBills;
    critical.push({
      id: 'moradia-contas',
      severity: 'critical',
      title: `Moradia + Contas Básicas consomem ${formatPct(hbShare)} da renda`,
      message: `São ${formatBRL(housing + bills)} de ${formatBRL(income)}. O ideal é ficar até ${formatPct(LIMITS.housingAndBills)}; passou ${formatBRL(excess)}.`,
      tip: 'Veja onde dá para aliviar: trocar o plano de internet/celular, pedir a tarifa social de luz (se tiver direito), reduzir consumo de água e energia, ou renegociar o aluguel.',
    });
  }

  if (i.overdue.count > 0) {
    const nomes = i.overdue.titles.slice(0, 4).join(', ') + (i.overdue.titles.length > 4 ? '…' : '');
    critical.push({
      id: 'atrasadas',
      severity: 'critical',
      title: `${i.overdue.count} ${i.overdue.count === 1 ? 'conta atrasada' : 'contas atrasadas'} (${formatBRL(i.overdue.amount)})`,
      message: `Atrasadas: ${nomes}.`,
      tip: 'Atraso gera multa e juros. Pague primeiro o que pode cortar serviço (luz, água), e negocie as outras — muitas empresas aceitam parcelar sem juros.',
    });
  }
  if (i.earlierOverdueCount > 0) {
    critical.push({
      id: 'atrasadas-antigas',
      severity: 'critical',
      title: `${i.earlierOverdueCount} ${i.earlierOverdueCount === 1 ? 'conta' : 'contas'} de meses anteriores ainda ${i.earlierOverdueCount === 1 ? 'pendente' : 'pendentes'}`,
      message: 'Elas continuam sem o status "Pago" e já passaram do vencimento.',
      tip: 'Se já pagou, marque como "Pago" na aba Gastos. Se não pagou, inclua na lista de prioridades.',
    });
  }

  const positives = i.members.filter((m) => m.free > 0).sort((a, b) => b.free - a.free);
  for (const m of i.members.filter((m) => m.free < -0.005)) {
    const helper = positives[0];
    critical.push({
      id: `pessoa-negativa-${m.name}`,
      severity: 'critical',
      title: `${m.name} está no vermelho: faltam ${formatBRL(-m.free)}`,
      message: `${m.name} recebe ${formatBRL(m.income)} mas ficou com ${formatBRL(m.owes)} de contas para pagar.`,
      tip: helper
        ? `${helper.name} fica com ${formatBRL(helper.free)} de sobra. Reveja a divisão: mudar alguns gastos para "Proporcional à renda" ou "Dividido igualmente" pode equilibrar.`
        : 'Reveja a divisão dos gastos entre as pessoas e o que pode ser cortado.',
    });
  }

  /* ============ 🟡 ATENÇÃO ============ */
  // Categoria variável que mais cresceu
  let top: { cat: Category; growth: number; prev: number; now: number } | null = null;
  for (const cat of Object.keys(i.variableByCategory) as Category[]) {
    const now = i.variableByCategory[cat];
    const prev = i.prevVariableByCategory[cat];
    const growth = now - prev;
    if (prev > 0 && growth >= 1 && (!top || growth > top.growth)) top = { cat, growth, prev, now };
  }
  if (top) {
    attention.push({
      id: 'variavel-cresceu',
      severity: 'attention',
      title: `${CATEGORY_LABELS[top.cat]} foi o gasto variável que mais subiu`,
      message: `Foi de ${formatBRL(top.prev)} para ${formatBRL(top.now)} (+${formatBRL(top.growth)}, ${formatPct(top.growth / top.prev)} a mais que no mês passado).`,
      tip: 'Gastos variáveis são os mais fáceis de controlar. Defina um teto semanal para essa categoria e anote cada compra.',
    });
  }

  const leisureShare = pct(leisure);
  if (income > 0 && leisureShare > LIMITS.leisure) {
    attention.push({
      id: 'lazer-alto',
      severity: 'attention',
      title: noReserve
        ? `Lazer/extras passaram de ${formatPct(LIMITS.leisure)} e a reserva está zerada`
        : `Lazer/extras passaram de ${formatPct(LIMITS.leisure)} da renda`,
      message: `Você gastou ${formatBRL(leisure)} (${formatPct(leisureShare)} da renda)${noReserve ? ' e nada foi guardado neste mês' : ''}.`,
      tip: noReserve
        ? `Que tal mover ${formatBRL(Math.max(10, Math.round(leisure * 0.3)))} do lazer para a reserva? Dá para se divertir de graça ou barato e ainda criar um colchão.`
        : 'Vale rever os gastos extras para sobrar mais no fim do mês.',
    });
  }

  if (income > 0 && noReserve) {
    const sug = income * LIMITS.suggestedSavings;
    attention.push({
      id: 'sem-reserva',
      severity: 'attention',
      title: 'Nada foi guardado na reserva (0% da renda)',
      message:
        balance > 0
          ? `Sobraram ${formatBRL(balance)} no mês, mas nada foi para a reserva.`
          : 'Neste mês não sobrou dinheiro para guardar.',
      tip:
        balance > 0
          ? `Guarde pelo menos ${formatBRL(Math.min(balance, sug))} (${formatPct(Math.min(balance, sug) / income)} da renda) assim que o dinheiro entrar — antes de gastar.`
          : `Mesmo um valor pequeno, como ${formatBRL(20)}, cria o hábito. A meta é chegar a ${formatPct(LIMITS.suggestedSavings)} da renda (${formatBRL(sug)}).`,
    });
  }

  if (income > 0 && pct(housing) > LIMITS.housing) {
    attention.push({
      id: 'moradia-alta',
      severity: 'attention',
      title: `Moradia está em ${formatPct(pct(housing))} da renda`,
      message: `A meta é até ${formatPct(LIMITS.housing)} (${formatBRL(income * LIMITS.housing)}).`,
      tip: 'Se possível, divida o aluguel com mais alguém, negocie o valor ou procure uma opção mais barata no próximo contrato.',
    });
  }
  if (income > 0 && pct(food) > LIMITS.food) {
    attention.push({
      id: 'alimentacao-alta',
      severity: 'attention',
      title: `Alimentação está em ${formatPct(pct(food))} da renda`,
      message: `A meta é até ${formatPct(LIMITS.food)} (${formatBRL(income * LIMITS.food)}).`,
      tip: 'Faça lista antes de ir ao mercado, compare preços por kg/litro, prefira comida de verdade em vez de industrializados e cozinhe em maior quantidade.',
    });
  }
  if (income > 0 && pct(debt) > LIMITS.debt) {
    attention.push({
      id: 'dividas-altas',
      severity: 'attention',
      title: `Dívidas pesam ${formatPct(pct(debt))} da renda`,
      message: `São ${formatBRL(debt)} por mês em parcelas. Acima de ${formatPct(LIMITS.debt)} fica difícil respirar.`,
      tip: 'Procure renegociar (feirões, Serasa Limpa Nome, banco) e quite primeiro as dívidas com juros mais altos, como cartão e cheque especial.',
    });
  }
  if (i.dueSoon.count > 0) {
    attention.push({
      id: 'vencendo',
      severity: 'attention',
      title: `${i.dueSoon.count} ${i.dueSoon.count === 1 ? 'conta vence' : 'contas vencem'} nos próximos 5 dias`,
      message: `Total de ${formatBRL(i.dueSoon.amount)} para pagar em breve.`,
      tip: 'Separe esse dinheiro agora para não ser pego de surpresa.',
    });
  }

  /* ============ 🟢 BEM ============ */
  if (income > 0 && i.expenseCount > 0 && balance >= 0) {
    good.push({
      id: 'no-azul',
      severity: 'good',
      title: balance > 0 ? `Mês no azul: sobram ${formatBRL(balance)}` : 'Mês fechando certinho, sem faltar nada',
      message:
        balance > 0
          ? `A renda (${formatBRL(income)}) cobre todos os gastos (${formatBRL(i.expensesTotal)}).`
          : 'A renda cobre exatamente os gastos. Parabéns pelo controle!',
      tip: balance > 0 && noReserve ? `Que tal guardar parte dessa sobra? Metade (${formatBRL(balance / 2)}) já ajuda muito.` : undefined,
    });
  }

  const housingOk = housing > 0 && pct(housing) <= LIMITS.housing;
  const foodOk = food > 0 && pct(food) <= LIMITS.food;
  if (income > 0 && housingOk && foodOk) {
    good.push({
      id: 'moradia-alimentacao-ok',
      severity: 'good',
      title: 'Moradia e alimentação dentro da meta',
      message: `Moradia em ${formatPct(pct(housing))} (meta ${formatPct(LIMITS.housing)}) e alimentação em ${formatPct(pct(food))} (meta ${formatPct(LIMITS.food)}).`,
    });
  } else if (income > 0 && housingOk) {
    good.push({
      id: 'moradia-ok',
      severity: 'good',
      title: 'Moradia dentro da meta',
      message: `Moradia em ${formatPct(pct(housing))} da renda (meta ${formatPct(LIMITS.housing)}).`,
    });
  } else if (income > 0 && foodOk) {
    good.push({
      id: 'alimentacao-ok',
      severity: 'good',
      title: 'Alimentação dentro da meta',
      message: `Alimentação em ${formatPct(pct(food))} da renda (meta ${formatPct(LIMITS.food)}).`,
    });
  }

  if (i.reserves.emergencyDepositedMonth > 0) {
    good.push({
      id: 'reserva-emergencia',
      severity: 'good',
      title: `Você guardou ${formatBRL(i.reserves.emergencyDepositedMonth)} na reserva de emergência`,
      message: 'Esse colchão protege a família quando surge um imprevisto. Continue assim!',
    });
  } else if (i.reserves.depositedMonth > 0) {
    good.push({
      id: 'reserva-deposito',
      severity: 'good',
      title: `Você guardou ${formatBRL(i.reserves.depositedMonth)} neste mês`,
      message: `Isso equivale a ${formatPct(pct(i.reserves.depositedMonth))} da renda. Guardar com constância é o que faz a reserva crescer.`,
    });
  }

  for (const name of i.reserves.reachedGoals) {
    good.push({
      id: `meta-${name}`,
      severity: 'good',
      title: `Meta "${name}" alcançada! 🎉`,
      message: 'O valor planejado já está guardado.',
    });
  }

  if (i.prevDebt > 0 && debt < i.prevDebt) {
    const red = i.prevDebt - debt;
    good.push({
      id: 'dividas-menores',
      severity: 'good',
      title: debt === 0 ? 'Você ficou sem dívidas neste mês! 🎉' : `Dívidas caíram ${formatBRL(red)}`,
      message: `Foram de ${formatBRL(i.prevDebt)} para ${formatBRL(debt)} em relação ao mês anterior.`,
    });
  }

  if (i.expenseCount > 0 && i.allPaid) {
    good.push({
      id: 'tudo-pago',
      severity: 'good',
      title: 'Todas as contas do mês estão pagas',
      message: 'Nada pendente. Isso é tranquilidade!',
    });
  }

  return { critical, attention, good };
}
