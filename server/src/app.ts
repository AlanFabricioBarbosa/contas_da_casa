import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { all, get, run, tx, type Db } from './db.js';
import { endSession, hashPassword, rateLimit, requireAuth, startSession, verifyPassword } from './auth.js';
import { CATEGORIES, EXPENSE_STATUS, EXPENSE_TYPES, RESERVE_KINDS, SPLIT_MODES } from './constants.js';
import { currentMonth, isMonth, isValidDate, prevMonth, todayBR } from './dates.js';
import { clearUserData, seedDemo } from './demo.js';
import {
  duplicateFixed,
  listMembers,
  rebuildSplits,
  replaceSplits,
  toSplitMembers,
  type ExpenseRow,
} from './expenses.js';
import { buildSummary } from './summary.js';
import { fromCents, toCents } from './money.js';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const money = (max = 1_000_000_000) =>
  z
    .number({ error: 'Informe um valor válido.' })
    .finite('Informe um valor válido.')
    .max(max, 'Valor alto demais.')
    .transform((v) => fromCents(toCents(v)));

const name = (label: string, max = 60) =>
  z
    .string({ error: `Informe ${label}.` })
    .trim()
    .min(1, `Informe ${label}.`)
    .max(max, `Use no máximo ${max} caracteres.`);

const monthParam = z.string().refine(isMonth, 'Mês inválido (use AAAA-MM).');

const expenseBody = z.object({
  title: name('o nome do gasto', 80),
  amount: money().refine((v) => v > 0, 'O valor deve ser maior que zero.'),
  category: z.enum(CATEGORIES, { error: 'Escolha uma categoria.' }),
  type: z.enum(EXPENSE_TYPES, { error: 'Escolha fixo ou variável.' }),
  split_mode: z.enum(SPLIT_MODES, { error: 'Escolha como dividir.' }),
  status: z.enum(EXPENSE_STATUS).default('pending'),
  due_date: z.string({ error: 'Informe o vencimento.' }).refine(isValidDate, 'Data de vencimento inválida.'),
  member_ids: z.array(z.number().int()).min(1, 'Escolha pelo menos uma pessoa.'),
});

const memberBody = z.object({
  name: name('o nome da pessoa', 40),
  monthly_income: money(10_000_000).refine((v) => v >= 0, 'A renda não pode ser negativa.'),
});

const reserveBody = z.object({
  name: name('o nome da reserva', 60),
  kind: z.enum(RESERVE_KINDS).default('other'),
  target_amount: money().refine((v) => v >= 0, 'A meta não pode ser negativa.').default(0),
});

const txBody = z.object({
  type: z.enum(['deposit', 'withdraw'], { error: 'Escolha depósito ou retirada.' }),
  amount: money().refine((v) => v > 0, 'O valor deve ser maior que zero.'),
  member_id: z.number().int().nullable().optional(),
  date: z.string().refine(isValidDate, 'Data inválida.').optional(),
  note: z.string().trim().max(120).optional(),
});

const credentials = {
  email: z
    .string({ error: 'Informe o e-mail.' })
    .trim()
    .toLowerCase()
    .email('E-mail inválido.')
    .max(120),
  password: z
    .string({ error: 'Informe a senha.' })
    .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
    .max(200),
};
const registerBody = z.object({ name: name('seu nome', 60), ...credentials });
const loginBody = z.object({ email: credentials.email, password: z.string().min(1, 'Informe a senha.') });

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  is_guest: number;
  has_demo_data: number;
}

const publicUser = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  email: u.is_guest ? null : u.email,
  is_guest: !!u.is_guest,
  has_demo_data: !!u.has_demo_data,
});

export function createApp(db: Db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '100kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  const api = express.Router();
  const authLimiter = rateLimit(20, 15 * 60 * 1000);
  const today = () => todayBR();

  const user = (req: Request) => get<UserRow>(db, 'SELECT * FROM users WHERE id = ?', req.userId!);

  /* ---------------- Autenticação ---------------- */
  api.post('/auth/register', authLimiter, (req, res) => {
    const body = registerBody.parse(req.body);
    if (get(db, 'SELECT 1 AS x FROM users WHERE email = ?', body.email)) {
      throw new HttpError(409, 'Já existe uma conta com este e-mail.');
    }
    const { id } = run(db, 'INSERT INTO users (email, name, password_hash) VALUES (?,?,?)', body.email, body.name, hashPassword(body.password));
    seedDemo(db, id, today());
    startSession(res, id);
    res.status(201).json(publicUser(user({ userId: id } as Request)!));
  });

  api.post('/auth/login', authLimiter, (req, res) => {
    const body = loginBody.parse(req.body);
    const u = get<UserRow>(db, 'SELECT * FROM users WHERE email = ? AND is_guest = 0', body.email);
    if (!u || !verifyPassword(body.password, u.password_hash)) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    startSession(res, u.id);
    res.json(publicUser(u));
  });

  // Conta de visitante já preenchida com o exemplo, para testar na hora.
  api.post('/auth/demo', authLimiter, (_req, res) => {
    const email = `visitante-${crypto.randomBytes(6).toString('hex')}@demo.local`;
    const { id } = run(
      db,
      'INSERT INTO users (email, name, password_hash, is_guest) VALUES (?,?,?,1)',
      email,
      'Visitante',
      hashPassword(crypto.randomBytes(16).toString('hex')),
    );
    seedDemo(db, id, today());
    startSession(res, id);
    res.status(201).json(publicUser(user({ userId: id } as Request)!));
  });

  api.post('/auth/logout', (_req, res) => {
    endSession(res);
    res.json({ ok: true });
  });

  api.get('/auth/me', requireAuth, (req, res) => {
    const u = user(req);
    if (!u) {
      endSession(res);
      throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    }
    res.json(publicUser(u));
  });

  // Transforma o visitante em conta de verdade, mantendo os dados.
  api.post('/auth/claim', requireAuth, (req, res) => {
    const u = user(req);
    if (!u?.is_guest) throw new HttpError(400, 'Esta conta já está registrada.');
    const body = registerBody.parse(req.body);
    if (get(db, 'SELECT 1 AS x FROM users WHERE email = ?', body.email)) {
      throw new HttpError(409, 'Já existe uma conta com este e-mail.');
    }
    run(db, 'UPDATE users SET email = ?, name = ?, password_hash = ?, is_guest = 0 WHERE id = ?', body.email, body.name, hashPassword(body.password), u.id);
    res.json(publicUser(user(req)!));
  });

  /* Tudo abaixo exige login */
  api.use(requireAuth);

  /* ---------------- Modo demonstração ---------------- */
  api.post('/demo/clear', (req, res) => {
    clearUserData(db, req.userId!);
    res.json({ ok: true });
  });
  api.post('/demo/load', (req, res) => {
    const uid = req.userId!;
    const has =
      get<{ n: number }>(db, 'SELECT (SELECT COUNT(*) FROM household_members WHERE user_id = ?) + (SELECT COUNT(*) FROM expenses WHERE user_id = ?) + (SELECT COUNT(*) FROM reserves WHERE user_id = ?) AS n', uid, uid, uid)?.n ?? 0;
    if (has > 0) throw new HttpError(400, 'Só é possível carregar o exemplo quando não há dados.');
    seedDemo(db, uid, today());
    res.json({ ok: true });
  });

  /* ---------------- Pessoas ---------------- */
  api.get('/members', (req, res) => {
    res.json(listMembers(db, req.userId!));
  });

  api.post('/members', (req, res) => {
    const b = memberBody.parse(req.body);
    const { id } = run(db, 'INSERT INTO household_members (user_id, name, monthly_income) VALUES (?,?,?)', req.userId!, b.name, b.monthly_income);
    res.status(201).json(get(db, 'SELECT * FROM household_members WHERE id = ?', id));
  });

  api.put('/members/:id', (req, res) => {
    const b = memberBody.parse(req.body);
    const id = Number(req.params.id);
    tx(db, () => {
      const r = run(db, 'UPDATE household_members SET name = ?, monthly_income = ? WHERE id = ? AND user_id = ?', b.name, b.monthly_income, id, req.userId!);
      if (!r.changes) throw new HttpError(404, 'Pessoa não encontrada.');
      rebuildSplits(db, req.userId!);
    });
    res.json(get(db, 'SELECT * FROM household_members WHERE id = ?', id));
  });

  api.delete('/members/:id', (req, res) => {
    const id = Number(req.params.id);
    tx(db, () => {
      const r = run(db, 'DELETE FROM household_members WHERE id = ? AND user_id = ?', id, req.userId!);
      if (!r.changes) throw new HttpError(404, 'Pessoa não encontrada.');
      rebuildSplits(db, req.userId!);
    });
    res.json({ ok: true });
  });

  /* ---------------- Gastos ---------------- */
  const loadExpense = (userId: number, id: number) => {
    const e = get<ExpenseRow>(db, 'SELECT * FROM expenses WHERE id = ? AND user_id = ?', id, userId);
    if (!e) return undefined;
    const splits = all<{ member_id: number; assigned_amount: number }>(
      db,
      'SELECT member_id, assigned_amount FROM expense_splits WHERE expense_id = ? ORDER BY member_id',
      id,
    );
    return { ...e, splits };
  };

  const pickMembers = (userId: number, mode: (typeof SPLIT_MODES)[number], ids: number[]) => {
    const unique = [...new Set(ids)];
    if (mode === 'individual' && unique.length !== 1) {
      throw new HttpError(400, 'No gasto individual, escolha exatamente uma pessoa.');
    }
    const all_ = listMembers(db, userId);
    const chosen = unique.map((id) => all_.find((m) => m.id === id));
    if (chosen.some((m) => !m)) throw new HttpError(400, 'Pessoa inválida.');
    return toSplitMembers(chosen as typeof all_);
  };

  api.get('/expenses', (req, res) => {
    const month = monthParam.parse(req.query.month ?? currentMonth());
    const rows = all<ExpenseRow>(db, 'SELECT * FROM expenses WHERE user_id = ? AND month_year = ? ORDER BY due_date, id', req.userId!, month);
    const splits = all<{ expense_id: number; member_id: number; assigned_amount: number }>(
      db,
      `SELECT s.expense_id, s.member_id, s.assigned_amount FROM expense_splits s
         JOIN expenses e ON e.id = s.expense_id WHERE e.user_id = ? AND e.month_year = ? ORDER BY s.member_id`,
      req.userId!,
      month,
    );
    const by = new Map<number, { member_id: number; assigned_amount: number }[]>();
    for (const s of splits) {
      const l = by.get(s.expense_id) ?? [];
      l.push({ member_id: s.member_id, assigned_amount: s.assigned_amount });
      by.set(s.expense_id, l);
    }
    res.json(rows.map((e) => ({ ...e, splits: by.get(e.id) ?? [] })));
  });

  api.post('/expenses', (req, res) => {
    const b = expenseBody.parse(req.body);
    const members = pickMembers(req.userId!, b.split_mode, b.member_ids);
    const id = tx(db, () => {
      const { id } = run(
        db,
        `INSERT INTO expenses (user_id, month_year, title, amount, category, type, split_mode, status, due_date)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        req.userId!, b.due_date.slice(0, 7), b.title, b.amount, b.category, b.type, b.split_mode, b.status, b.due_date,
      );
      replaceSplits(db, id, b.split_mode, b.amount, members);
      return id;
    });
    res.status(201).json(loadExpense(req.userId!, id));
  });

  api.put('/expenses/:id', (req, res) => {
    const b = expenseBody.parse(req.body);
    const id = Number(req.params.id);
    if (!loadExpense(req.userId!, id)) throw new HttpError(404, 'Gasto não encontrado.');
    const members = pickMembers(req.userId!, b.split_mode, b.member_ids);
    tx(db, () => {
      run(
        db,
        `UPDATE expenses SET month_year = ?, title = ?, amount = ?, category = ?, type = ?, split_mode = ?, status = ?, due_date = ?
          WHERE id = ? AND user_id = ?`,
        b.due_date.slice(0, 7), b.title, b.amount, b.category, b.type, b.split_mode, b.status, b.due_date, id, req.userId!,
      );
      replaceSplits(db, id, b.split_mode, b.amount, members);
    });
    res.json(loadExpense(req.userId!, id));
  });

  api.patch('/expenses/:id/status', (req, res) => {
    const { status } = z.object({ status: z.enum(EXPENSE_STATUS) }).parse(req.body);
    const r = run(db, 'UPDATE expenses SET status = ? WHERE id = ? AND user_id = ?', status, Number(req.params.id), req.userId!);
    if (!r.changes) throw new HttpError(404, 'Gasto não encontrado.');
    res.json(loadExpense(req.userId!, Number(req.params.id)));
  });

  api.delete('/expenses/:id', (req, res) => {
    const r = run(db, 'DELETE FROM expenses WHERE id = ? AND user_id = ?', Number(req.params.id), req.userId!);
    if (!r.changes) throw new HttpError(404, 'Gasto não encontrado.');
    res.json({ ok: true });
  });

  api.post('/expenses/duplicate-fixed', (req, res) => {
    const b = z.object({ to: monthParam, from: monthParam.optional() }).parse(req.body);
    const from = b.from ?? prevMonth(b.to);
    if (from === b.to) throw new HttpError(400, 'Escolha meses diferentes.');
    const result = tx(db, () => duplicateFixed(db, req.userId!, from, b.to));
    res.json({ ...result, from, to: b.to });
  });

  /* ---------------- Reservas ---------------- */
  const reserveOwned = (userId: number, id: number) => {
    const r = get<{ id: number; current_amount: number }>(db, 'SELECT * FROM reserves WHERE id = ? AND user_id = ?', id, userId);
    if (!r) throw new HttpError(404, 'Reserva não encontrada.');
    return r;
  };

  api.get('/reserves', (req, res) => {
    const reserves = all<{ id: number }>(db, 'SELECT * FROM reserves WHERE user_id = ? ORDER BY id', req.userId!);
    const contrib = all<{ reserve_id: number; member_id: number; name: string; total: number }>(
      db,
      `SELECT t.reserve_id, t.member_id, m.name,
              SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE -t.amount END) AS total
         FROM reserve_transactions t JOIN household_members m ON m.id = t.member_id
         JOIN reserves r ON r.id = t.reserve_id
        WHERE r.user_id = ? GROUP BY t.reserve_id, t.member_id ORDER BY total DESC`,
      req.userId!,
    );
    res.json(
      reserves.map((r) => ({
        ...r,
        contributions: contrib.filter((c) => c.reserve_id === r.id).map((c) => ({ member_id: c.member_id, name: c.name, total: fromCents(toCents(c.total)) })),
      })),
    );
  });

  api.post('/reserves', (req, res) => {
    const b = reserveBody.extend({ current_amount: money().refine((v) => v >= 0).default(0) }).parse(req.body);
    const { id } = run(
      db,
      'INSERT INTO reserves (user_id, name, kind, target_amount, current_amount) VALUES (?,?,?,?,?)',
      req.userId!, b.name, b.kind, b.target_amount, b.current_amount,
    );
    res.status(201).json(get(db, 'SELECT * FROM reserves WHERE id = ?', id));
  });

  api.put('/reserves/:id', (req, res) => {
    const b = reserveBody.parse(req.body);
    const id = Number(req.params.id);
    reserveOwned(req.userId!, id);
    run(db, 'UPDATE reserves SET name = ?, kind = ?, target_amount = ? WHERE id = ?', b.name, b.kind, b.target_amount, id);
    res.json(get(db, 'SELECT * FROM reserves WHERE id = ?', id));
  });

  api.delete('/reserves/:id', (req, res) => {
    reserveOwned(req.userId!, Number(req.params.id));
    run(db, 'DELETE FROM reserves WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });

  api.get('/reserves/:id/transactions', (req, res) => {
    reserveOwned(req.userId!, Number(req.params.id));
    res.json(
      all(
        db,
        `SELECT t.id, t.amount, t.type, t.date, t.note, t.member_id, m.name AS member_name
           FROM reserve_transactions t LEFT JOIN household_members m ON m.id = t.member_id
          WHERE t.reserve_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 100`,
        Number(req.params.id),
      ),
    );
  });

  api.post('/reserves/:id/transactions', (req, res) => {
    const b = txBody.parse(req.body);
    const id = Number(req.params.id);
    const reserve = reserveOwned(req.userId!, id);
    if (b.member_id != null && !listMembers(db, req.userId!).some((m) => m.id === b.member_id)) {
      throw new HttpError(400, 'Pessoa inválida.');
    }
    if (b.type === 'withdraw' && b.amount > reserve.current_amount + 0.001) {
      throw new HttpError(400, 'Você não pode retirar mais do que há guardado nesta reserva.');
    }
    tx(db, () => {
      run(
        db,
        'INSERT INTO reserve_transactions (reserve_id, member_id, amount, type, date, note) VALUES (?,?,?,?,?,?)',
        id, b.member_id ?? null, b.amount, b.type, b.date ?? today(), b.note || null,
      );
      const delta = b.type === 'deposit' ? b.amount : -b.amount;
      run(db, 'UPDATE reserves SET current_amount = ROUND(current_amount + ?, 2) WHERE id = ?', delta, id);
    });
    res.status(201).json(get(db, 'SELECT * FROM reserves WHERE id = ?', id));
  });

  api.delete('/reserves/:id/transactions/:txId', (req, res) => {
    const id = Number(req.params.id);
    const reserve = reserveOwned(req.userId!, id);
    const t = get<{ amount: number; type: string }>(db, 'SELECT amount, type FROM reserve_transactions WHERE id = ? AND reserve_id = ?', Number(req.params.txId), id);
    if (!t) throw new HttpError(404, 'Movimentação não encontrada.');
    const delta = t.type === 'deposit' ? -t.amount : t.amount;
    if (reserve.current_amount + delta < -0.001) {
      throw new HttpError(400, 'Não dá para desfazer: o saldo da reserva ficaria negativo.');
    }
    tx(db, () => {
      run(db, 'DELETE FROM reserve_transactions WHERE id = ?', Number(req.params.txId));
      run(db, 'UPDATE reserves SET current_amount = MAX(0, ROUND(current_amount + ?, 2)) WHERE id = ?', delta, id);
    });
    res.json({ ok: true });
  });

  /* ---------------- Painel ---------------- */
  api.get('/summary', (req, res) => {
    const month = monthParam.parse(req.query.month ?? currentMonth());
    res.json(buildSummary(db, req.userId!, month, today()));
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.')));
  app.use('/api', api);

  /* ---------------- Front-end (build de produção) ---------------- */
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues[0]?.message ?? 'Dados inválidos.' });
    } else if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'Requisição inválida.' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Algo deu errado do nosso lado. Tente de novo.' });
    }
  });

  return app;
}
