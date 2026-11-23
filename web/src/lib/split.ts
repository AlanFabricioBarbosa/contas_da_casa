import type { Member, SplitMode } from './types';

/** Mesmo cálculo do servidor (em centavos, sem perder nenhum) — usado só para pré-visualizar. */
export function previewSplit(mode: SplitMode, amount: number, members: Member[]): { member: Member; value: number }[] {
  if (members.length === 0 || amount <= 0) return [];
  const total = Math.round(amount * 100);
  if (mode === 'individual') return [{ member: members[0]!, value: total / 100 }];
  const weights = mode === 'equal' ? members.map(() => 1) : members.map((m) => Math.round(m.monthly_income * 100));
  let sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  if (sum <= 0) sum = members.length;
  const raw = w.map((x) => (total * x) / sum);
  const base = raw.map(Math.floor);
  let rest = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    rest--;
  }
  return members.map((member, i) => ({ member, value: (base[i] ?? 0) / 100 }));
}
