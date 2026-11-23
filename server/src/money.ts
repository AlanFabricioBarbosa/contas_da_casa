import type { SplitMode } from './constants.js';

export const toCents = (v: number) => Math.round(v * 100);
export const fromCents = (c: number) => Math.round(c) / 100;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (v: number) => brl.format(v).replace(/\u00a0/g, ' ');

const pctFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const formatPct = (ratio: number) => `${pctFmt.format(ratio * 100)}%`;

/**
 * Divide `totalCents` conforme os pesos, sem perder centavos
 * (método do maior resto). Se todos os pesos forem 0, divide igualmente.
 */
export function allocate(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  let sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  if (sum <= 0) sum = n;

  const raw = w.map((x) => (totalCents * x) / sum);
  const base = raw.map(Math.floor);
  let rest = totalCents - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    rest--;
  }
  return base;
}

export interface SplitMember {
  id: number;
  income: number;
}
export interface SplitResult {
  member_id: number;
  assigned_amount: number;
}

/** Calcula quanto cada pessoa paga de um gasto. */
export function calcSplits(mode: SplitMode, amount: number, members: SplitMember[]): SplitResult[] {
  if (members.length === 0) return [];
  const total = toCents(amount);
  const first = members[0] as SplitMember;
  if (mode === 'individual') {
    return [{ member_id: first.id, assigned_amount: fromCents(total) }];
  }
  const weights = mode === 'equal' ? members.map(() => 1) : members.map((m) => toCents(m.income));
  const parts = allocate(total, weights);
  return members.map((m, i) => ({ member_id: m.id, assigned_amount: fromCents(parts[i] ?? 0) }));
}
