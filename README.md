# Contas da Casa — controle financeiro pessoal e familiar

Plataforma web em português (R$) para quem tem orçamento apertado: cadastra as pessoas da casa e suas rendas,
lança gastos com divisão (individual, igual ou proporcional à renda), guarda reservas e recebe um **Consultor**
que explica, em linguagem simples, onde falta dinheiro, o que melhorar e o que está indo bem.

## Stack

- **Front-end:** React 19 + TypeScript + Tailwind CSS 4, componentes no estilo shadcn/ui (em `web/src/components/ui`),
  mobile-first, modo claro/escuro, diálogos com `<dialog>` nativo.
- **Back-end:** Node.js + Express 5 + **SQLite** (módulo nativo `node:sqlite`, sem compilar nada) + Zod.
- **Autenticação:** e-mail e senha (scrypt) com sessão em cookie `httpOnly`. Cada usuário só enxerga os próprios dados.

## Como rodar

Requer Node.js 22.13 ou superior.

```bash
npm install
npm run dev        # API em :3001 e front em http://localhost:5173
```

Produção (o servidor entrega o front compilado):

```bash
npm run build
npm start          # http://localhost:3001
```

Testes do servidor (divisão de gastos, motor do Consultor e API completa): `npm test`.

Variáveis opcionais: `PORT`, `DB_PATH` (arquivo SQLite; padrão `server/data/financas.db`), `JWT_SECRET`
(se ausente, é gerado e salvo em `server/data/.jwt-secret`), `COOKIE_SECURE=true` (use atrás de HTTPS).

## Modo demonstração

- Tela de entrada: **"Testar agora com dados de exemplo"** cria uma conta de visitante já preenchida
  (casal com 1 salário mínimo cada, aluguel e contas divididos). Dá para transformá-la em conta real depois.
- Contas novas também começam com o exemplo. O botão **"Limpar dados de exemplo e começar do zero"**
  fica visível no topo enquanto houver dados de exemplo.

## Regras do Consultor (`server/src/diagnosis.ts`)

| Bloco | Regras |
|---|---|
| 🔴 Faltando | gastos > renda (mostra quanto falta) · Moradia + Contas Básicas > 45% da renda · contas atrasadas · saldo negativo de alguma pessoa após a divisão |
| 🟡 Melhorar | categoria variável que mais subiu vs. mês anterior · 0% da renda nas reservas · lazer > 10% com reserva zerada · moradia > 35%, alimentação > 30%, dívidas > 15% · contas vencendo em 5 dias |
| 🟢 Bem | mês no azul · moradia/alimentação dentro da meta · depósito na reserva de emergência · dívidas menores · meta de reserva alcançada · tudo pago |

Os limites ficam em `server/src/constants.ts`.

## Banco de dados

Tabelas em `server/src/db.ts`: `users`, `household_members`, `expenses`, `expense_splits`, `reserves`,
`reserve_transactions` (conforme a estrutura sugerida; `reserves.kind` identifica a reserva de emergência).
Ao mudar uma renda ou remover uma pessoa, as divisões "igual" e "proporcional" são recalculadas.
