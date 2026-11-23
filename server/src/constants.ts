export const CATEGORIES = [
  'moradia',
  'contas_basicas',
  'alimentacao',
  'transporte',
  'saude',
  'dividas',
  'lazer',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  moradia: 'Moradia',
  contas_basicas: 'Contas Básicas',
  alimentacao: 'Alimentação',
  transporte: 'Transporte',
  saude: 'Saúde',
  dividas: 'Dívidas',
  lazer: 'Lazer/Pessoal',
};

export const EXPENSE_TYPES = ['fixed', 'variable'] as const;
export const EXPENSE_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export const SPLIT_MODES = ['individual', 'equal', 'proportional'] as const;
export const EXPENSE_STATUS = ['paid', 'pending'] as const;
export const RESERVE_KINDS = ['emergency', 'annual', 'goal', 'other'] as const;

export type ExpenseType = (typeof EXPENSE_TYPES)[number];
export type ExpenseFrequency = (typeof EXPENSE_FREQUENCIES)[number];
export type SplitMode = (typeof SPLIT_MODES)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUS)[number];
export type ReserveKind = (typeof RESERVE_KINDS)[number];

/** Metas usadas pelo Consultor (percentuais da renda total da casa). */
export const LIMITS = {
  housingAndBills: 0.45, // Moradia + Contas Básicas
  housing: 0.35, // Moradia
  food: 0.3, // Alimentação
  leisure: 0.1, // Lazer/Pessoal
  debt: 0.15, // Dívidas
  suggestedSavings: 0.05, // sugestão de reserva
} as const;
