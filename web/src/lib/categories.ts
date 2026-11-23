import { Bus, CreditCard, HeartPulse, House, PartyPopper, ShoppingBasket, Zap, type LucideIcon } from 'lucide-react';
import type { Category, ExpenseFrequency, ReserveKind } from './types';

export const FREQUENCY_ORDER: ExpenseFrequency[] = ['daily', 'weekly', 'monthly'];

export const FREQUENCY_INFO: Record<ExpenseFrequency, { label: string; short: string; hint: string; color: string }> = {
  daily: { label: 'Do dia', short: 'Do dia', hint: 'Uber, lanche, avulso', color: '#3b82f6' },
  weekly: { label: 'Semanal', short: 'Semanal', hint: 'Feira, semana', color: '#a855f7' },
  monthly: { label: 'Mensal', short: 'Mensal', hint: 'Aluguel, luz, conta do mês', color: '#0d9488' },
};

export const CATEGORY_ORDER: Category[] = ['moradia', 'contas_basicas', 'alimentacao', 'transporte', 'saude', 'dividas', 'lazer'];

export const CATEGORY_INFO: Record<Category, { label: string; color: string; icon: LucideIcon }> = {
  moradia: { label: 'Moradia', color: '#0d9488', icon: House },
  contas_basicas: { label: 'Contas Básicas', color: '#f59e0b', icon: Zap },
  alimentacao: { label: 'Alimentação', color: '#22c55e', icon: ShoppingBasket },
  transporte: { label: 'Transporte', color: '#3b82f6', icon: Bus },
  saude: { label: 'Saúde', color: '#ec4899', icon: HeartPulse },
  dividas: { label: 'Dívidas', color: '#ef4444', icon: CreditCard },
  lazer: { label: 'Lazer/Pessoal', color: '#a855f7', icon: PartyPopper },
};

export const RESERVE_KIND_LABEL: Record<ReserveKind, string> = {
  emergency: 'Reserva de emergência',
  annual: 'Contas anuais (IPTU, IPVA…)',
  goal: 'Meta pessoal',
  other: 'Outra',
};

export const SPLIT_LABEL = {
  individual: 'Individual',
  equal: 'Dividido igualmente',
  proportional: 'Proporcional à renda',
} as const;
