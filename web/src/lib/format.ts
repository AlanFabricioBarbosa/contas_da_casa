const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 1500 → "R$ 1.500,00" */
export const brlFmt = (v: number) => brl.format(v).replace(/\u00a0/g, ' ');
/** 1500 → "1.500,00" */
export const numFmt = (v: number) => num.format(v);
/** 0.256 → "25,6%" */
export const pctFmt = (ratio: number) => `${pct.format(ratio * 100)}%`;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTH_NAMES = MONTHS;

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "novembro de 2026" → "Novembro de 2026" */
export const monthTitle = (month: string) => {
  const l = monthLabel(month);
  return l.charAt(0).toUpperCase() + l.slice(1);
};

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Hoje (AAAA-MM-DD) no fuso de Brasília */
export function todayBR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
export const currentMonth = () => todayBR().slice(0, 7);

export function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-11-05" → "05/11" */
export function shortDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}
export function fullDate(date: string) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}
