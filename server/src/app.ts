import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { all, get, insert, run, tx, type Db } from './db.js';
import { endSession, hashPassword, rateLimit, requireAuth, startSession, verifyPassword } from './auth.js';
import { CATEGORIES, EXPENSE_FREQUENCIES, EXPENSE_STATUS, EXPENSE_TYPES, RESERVE_KINDS, SPLIT_MODES } from './constants.js';
import { addDays, currentMonth, dateInMonth, isMonth, isValidDate, prevMonth, shiftMonth, todayBR } from './dates.js';
import { clearUserData } from './demo.js';
import {
  duplicateFixed,
  listMembers,
  rebuildSplits,
  replaceSplits,
  toSplitMembers,
  type ExpenseRow,
} from './expenses.js';
import { buildSummary } from './summary.js';
import { allocate, fromCents, toCents } from './money.js';
import { sendVerificationMail, type MailSender } from './mailer.js';

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
  frequency: z.enum(EXPENSE_FREQUENCIES).default('monthly'),
  split_mode: z.enum(SPLIT_MODES, { error: 'Escolha como dividir.' }),
  status: z.enum(EXPENSE_STATUS).default('pending'),
  due_date: z.string({ error: 'Informe o vencimento.' }).refine(isValidDate, 'Data de vencimento inválida.'),
  member_ids: z.array(z.number().int()).min(1, 'Escolha pelo menos uma pessoa.'),
  tag: z.string().trim().max(40).nullable().optional(),
});

const createExpenseBody = expenseBody.extend({
  installments: z.number().int().min(1, 'Mínimo 1 parcela.').max(60, 'Máximo de 60 parcelas.').default(1),
  installment_amount_mode: z.enum(['total', 'installment']).default('total'),
});

const tagBody = z.object({
  name: name('o nome da tag', 40),
  category: z.enum(CATEGORIES, { error: 'Escolha uma categoria.' }),
  default_amount: money().refine((v) => v >= 0, 'O valor não pode ser negativo.').default(0),
});

const memberBody = z.object({
  name: name('o nome da pessoa', 40),
  monthly_income: money(10_000_000).refine((v) => v >= 0, 'A renda não pode ser negativa.'),
});

const extraIncomeBody = z.object({
  member_id: z.number().int({ error: 'Escolha a pessoa.' }),
  title: name('a descrição da renda extra', 80),
  amount: money(10_000_000).refine((v) => v > 0, 'O valor deve ser maior que zero.'),
  date: z.string({ error: 'Informe a data.' }).refine(isValidDate, 'Data inválida.'),
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
const verifyEmailBody = z.object({
  email: credentials.email,
  code: z.string({ error: 'Informe o código.' }).trim().regex(/^\d{6}$/, 'Digite os 6 dígitos do código.'),
});
const resendBody = z.object({ email: credentials.email });

const CODE_TTL_MS = 10 * 60 * 1000;
const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const hashCode = (email: string, code: string) =>
  crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
const codeMatches = (email: string, code: string, storedHex: string) => {
  const actual = Buffer.from(hashCode(email, code), 'hex');
  const expected = Buffer.from(storedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

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

interface PendingRow {
  email: string;
  name: string;
  password_hash: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
}

export function createApp(db: Db, opts?: { sendMail?: MailSender }) {
  const sendMail = opts?.sendMail ?? sendVerificationMail;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
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

  const userById = (id: number) => get<UserRow>(db, 'SELECT * FROM users WHERE id = ?', id);

  /* ---------------- Autenticação ---------------- */
  api.post('/auth/register', authLimiter, async (req, res) => {
    const body = registerBody.parse(req.body);
    if (await get(db, 'SELECT 1 AS x FROM users WHERE email = ?', body.email)) {
      throw new HttpError(409, 'Já existe uma conta com este e-mail.');
    }
    const code = genCode();
    try {
      await sendMail({ to: body.email, name: body.name, code });
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : 'Falha ao enviar o e-mail de verificação.');
    }
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const passHash = hashPassword(body.password);
    const cHash = hashCode(body.email, code);
    await tx(db, async (tdb) => {
      await run(tdb, 'DELETE FROM pending_registrations WHERE email = ?', body.email);
      await run(
        tdb,
        'INSERT INTO pending_registrations (email, name, password_hash, code_hash, attempts, expires_at) VALUES (?,?,?,?,0,?)',
        body.email,
        body.name,
        passHash,
        cHash,
        expiresAt,
      );
    });
    res.status(202).json({ pending: true, email: body.email });
  });

  api.post('/auth/verify-email', authLimiter, async (req, res) => {
    const body = verifyEmailBody.parse(req.body);
    if (await get(db, 'SELECT 1 AS x FROM users WHERE email = ?', body.email)) {
      throw new HttpError(409, 'Este e-mail já está confirmado. Faça login.');
    }
    const pending = await get<PendingRow>(db, 'SELECT * FROM pending_registrations WHERE email = ?', body.email);
    if (!pending) {
      throw new HttpError(400, 'Nenhum cadastro pendente para este e-mail. Comece novamente.');
    }
    if (pending.expires_at < new Date().toISOString()) {
      throw new HttpError(400, 'Este código venceu. Clique em "Reenviar código".');
    }
    if (pending.attempts >= 5) {
      throw new HttpError(429, 'Muitas tentativas erradas. Clique em "Reenviar código" para gerar um novo.');
    }
    if (!codeMatches(body.email, body.code, pending.code_hash)) {
      await run(db, 'UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = ?', body.email);
      throw new HttpError(400, 'Código incorreto. Confira o número de 6 dígitos enviado para o seu e-mail.');
    }
    const id = await tx(db, async (tdb) => {
      if (await get(tdb, 'SELECT 1 AS x FROM users WHERE email = ?', body.email)) {
        throw new HttpError(409, 'Já existe uma conta com este e-mail.');
      }
      const createdId = await insert(
        tdb,
        'INSERT INTO users (email, name, password_hash) VALUES (?,?,?)',
        pending.email,
        pending.name,
        pending.password_hash,
      );
      await run(tdb, 'DELETE FROM pending_registrations WHERE email = ?', body.email);
      return createdId;
    });
    startSession(res, id);
    res.status(201).json(publicUser((await userById(id))!));
  });

  api.post('/auth/resend-code', authLimiter, async (req, res) => {
    const body = resendBody.parse(req.body);
    if (await get(db, 'SELECT 1 AS x FROM users WHERE email = ?', body.email)) {
      throw new HttpError(409, 'Este e-mail já está cadastrado. Faça login.');
    }
    const pending = await get<PendingRow>(db, 'SELECT * FROM pending_registrations WHERE email = ?', body.email);
    if (!pending) {
      throw new HttpError(400, 'Nenhum cadastro pendente para este e-mail.');
    }
    const code = genCode();
    try {
      await sendMail({ to: pending.email, name: pending.name, code });
    } catch (e) {
      throw new HttpError(502, e instanceof Error ? e.message : 'Falha ao reenviar o e-mail.');
    }
    await run(
      db,
      'UPDATE pending_registrations SET code_hash = ?, attempts = 0, expires_at = ? WHERE email = ?',
      hashCode(pending.email, code),
      new Date(Date.now() + CODE_TTL_MS).toISOString(),
      pending.email,
    );
    res.json({ ok: true });
  });

  api.post('/auth/login', authLimiter, async (req, res) => {
    const body = loginBody.parse(req.body);
    const u = await get<UserRow>(db, 'SELECT * FROM users WHERE email = ? AND is_guest = 0', body.email);
    if (!u || !verifyPassword(body.password, u.password_hash)) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    startSession(res, u.id);
    res.json(publicUser(u));
  });

  api.post('/auth/logout', (_req, res) => {
    endSession(res);
    res.json({ ok: true });
  });

  api.get('/auth/me', requireAuth, async (req, res) => {
    const u = await userById(req.userId!);
    if (!u) {
      endSession(res);
      throw new HttpError(401, 'Sessão expirada. Entre novamente.');
    }
    res.json(publicUser(u));
  });

  /* Tudo abaixo exige login */
  api.use(requireAuth);

  /* ---------------- Limpeza de exemplo legado ---------------- */
  api.post('/demo/clear', async (req, res) => {
    await clearUserData(db, req.userId!);
    res.json({ ok: true });
  });

  /* ---------------- Pessoas ---------------- */
  api.get('/members', async (req, res) => {
    res.json(await listMembers(db, req.userId!));
  });

  api.post('/members', async (req, res) => {
    const b = memberBody.parse(req.body);
    const id = await insert(db, 'INSERT INTO household_members (user_id, name, monthly_income) VALUES (?,?,?)', req.userId!, b.name, b.monthly_income);
    res.status(201).json(await get(db, 'SELECT * FROM household_members WHERE id = ?', id));
  });

  api.put('/members/:id', async (req, res) => {
    const b = memberBody.parse(req.body);
    const id = Number(req.params.id);
    await tx(db, async (tdb) => {
      const r = await run(
        tdb,
        'UPDATE household_members SET name = ?, monthly_income = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        b.name,
        b.monthly_income,
        new Date().toISOString(),
        id,
        req.userId!,
      );
      if (!r.changes) throw new HttpError(404, 'Pessoa não encontrada.');
      await rebuildSplits(tdb, req.userId!);
    });
    res.json(await get(db, 'SELECT * FROM household_members WHERE id = ?', id));
  });

  api.delete('/members/:id', async (req, res) => {
    const id = Number(req.params.id);
    await tx(db, async (tdb) => {
      const r = await run(tdb, 'DELETE FROM household_members WHERE id = ? AND user_id = ?', id, req.userId!);
      if (!r.changes) throw new HttpError(404, 'Pessoa não encontrada.');
      await rebuildSplits(tdb, req.userId!);
    });
    res.json({ ok: true });
  });

  /* ---------------- Rendas Extras ---------------- */
  const loadExtraIncome = (userId: number, id: number) =>
    get(
      db,
      `SELECT e.id, e.member_id, m.name AS member_name, e.month_year, e.title, e.amount, e.date, e.created_at
         FROM extra_incomes e JOIN household_members m ON m.id = e.member_id
        WHERE e.id = ? AND e.user_id = ?`,
      id,
      userId,
    );

  api.get('/extra-incomes', async (req, res) => {
    const month = monthParam.parse(req.query.month ?? currentMonth());
    res.json(
      await all(
        db,
        `SELECT e.id, e.member_id, m.name AS member_name, e.month_year, e.title, e.amount, e.date, e.created_at
           FROM extra_incomes e JOIN household_members m ON m.id = e.member_id
          WHERE e.user_id = ? AND e.month_year = ?
          ORDER BY e.date DESC, e.id DESC`,
        req.userId!,
        month,
      ),
    );
  });

  api.post('/extra-incomes', async (req, res) => {
    const b = extraIncomeBody.parse(req.body);
    if (!(await listMembers(db, req.userId!)).some((m) => m.id === b.member_id)) {
      throw new HttpError(400, 'Pessoa inválida.');
    }
    const id = await insert(
      db,
      `INSERT INTO extra_incomes (user_id, member_id, month_year, title, amount, date)
       VALUES (?,?,?,?,?,?)`,
      req.userId!,
      b.member_id,
      b.date.slice(0, 7),
      b.title,
      b.amount,
      b.date,
    );
    res.status(201).json(await loadExtraIncome(req.userId!, id));
  });

  api.put('/extra-incomes/:id', async (req, res) => {
    const b = extraIncomeBody.parse(req.body);
    const id = Number(req.params.id);
    if (!(await listMembers(db, req.userId!)).some((m) => m.id === b.member_id)) {
      throw new HttpError(400, 'Pessoa inválida.');
    }
    const r = await run(
      db,
      `UPDATE extra_incomes SET member_id = ?, month_year = ?, title = ?, amount = ?, date = ?
        WHERE id = ? AND user_id = ?`,
      b.member_id,
      b.date.slice(0, 7),
      b.title,
      b.amount,
      b.date,
      id,
      req.userId!,
    );
    if (!r.changes) throw new HttpError(404, 'Renda extra não encontrada.');
    res.json(await loadExtraIncome(req.userId!, id));
  });

  api.delete('/extra-incomes/:id', async (req, res) => {
    const r = await run(db, 'DELETE FROM extra_incomes WHERE id = ? AND user_id = ?', Number(req.params.id), req.userId!);
    if (!r.changes) throw new HttpError(404, 'Renda extra não encontrada.');
    res.json({ ok: true });
  });

  /* ---------------- Gastos ---------------- */
  const loadExpense = async (userId: number, id: number) => {
    const e = await get<ExpenseRow>(db, 'SELECT * FROM expenses WHERE id = ? AND user_id = ?', id, userId);
    if (!e) return undefined;
    const splits = await all<{ member_id: number; assigned_amount: number }>(
      db,
      'SELECT member_id, assigned_amount FROM expense_splits WHERE expense_id = ? ORDER BY member_id',
      id,
    );
    return { ...e, splits };
  };

  const pickMembers = async (userId: number, mode: (typeof SPLIT_MODES)[number], ids: number[]) => {
    const unique = [...new Set(ids)];
    if (mode === 'individual' && unique.length !== 1) {
      throw new HttpError(400, 'No gasto individual, escolha exatamente uma pessoa.');
    }
    const all_ = await listMembers(db, userId);
    const chosen = unique.map((id) => all_.find((m) => m.id === id));
    if (chosen.some((m) => !m)) throw new HttpError(400, 'Pessoa inválida.');
    return toSplitMembers(chosen as typeof all_);
  };

  api.get('/expenses', async (req, res) => {
    const month = monthParam.parse(req.query.month ?? currentMonth());
    const rows = await all<ExpenseRow>(db, 'SELECT * FROM expenses WHERE user_id = ? AND month_year = ? ORDER BY due_date, id', req.userId!, month);
    const splits = await all<{ expense_id: number; member_id: number; assigned_amount: number }>(
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

  api.post('/expenses', async (req, res) => {
    const b = createExpenseBody.parse(req.body);
    const members = await pickMembers(req.userId!, b.split_mode, b.member_ids);
    if (b.installments > 1 && b.installment_amount_mode === 'total' && toCents(b.amount) < b.installments) {
      throw new HttpError(400, 'O valor total precisa dar pelo menos R$ 0,01 por parcela.');
    }

    const firstId = await tx(db, async (tdb) => {
      if (b.installments === 1) {
        const createdId = await insert(
          tdb,
          `INSERT INTO expenses (user_id, month_year, title, amount, category, type, frequency, split_mode, status, due_date, tag)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          req.userId!, b.due_date.slice(0, 7), b.title, b.amount, b.category, b.type, b.frequency, b.split_mode, b.status, b.due_date, b.tag || null,
        );
        await replaceSplits(tdb, createdId, b.split_mode, b.amount, members);
        return createdId;
      }

      const group = crypto.randomUUID();
      const centsList =
        b.installment_amount_mode === 'total'
          ? allocate(toCents(b.amount), Array(b.installments).fill(1))
          : Array<number>(b.installments).fill(toCents(b.amount));
      const startMonth = b.due_date.slice(0, 7);
      const startDay = Number(b.due_date.slice(8, 10));
      const freq = b.frequency === 'weekly' ? 'weekly' : 'monthly';

      let headId = 0;
      for (let k = 0; k < b.installments; k++) {
        const due = freq === 'weekly' ? addDays(b.due_date, k * 7) : dateInMonth(shiftMonth(startMonth, k), startDay);
        const amt = fromCents(centsList[k]!);
        const st = k === 0 ? b.status : 'pending';
        const createdId = await insert(
          tdb,
          `INSERT INTO expenses (user_id, month_year, title, amount, category, type, frequency, split_mode, status, due_date, tag, installment_group, installment_num, installment_total)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          req.userId!, due.slice(0, 7), b.title, amt, b.category, 'variable', freq, b.split_mode, st, due, b.tag || null, group, k + 1, b.installments,
        );
        await replaceSplits(tdb, createdId, b.split_mode, amt, members);
        if (k === 0) headId = createdId;
      }
      return headId;
    });
    const head = await loadExpense(req.userId!, firstId);
    res.status(201).json({ ...head, created_count: b.installments });
  });

  api.put('/expenses/:id', async (req, res) => {
    const b = expenseBody.parse(req.body);
    const id = Number(req.params.id);
    if (!(await loadExpense(req.userId!, id))) throw new HttpError(404, 'Gasto não encontrado.');
    const members = await pickMembers(req.userId!, b.split_mode, b.member_ids);
    await tx(db, async (tdb) => {
      await run(
        tdb,
        `UPDATE expenses SET month_year = ?, title = ?, amount = ?, category = ?, type = ?, frequency = ?, split_mode = ?, status = ?, due_date = ?, tag = ?
          WHERE id = ? AND user_id = ?`,
        b.due_date.slice(0, 7), b.title, b.amount, b.category, b.type, b.frequency, b.split_mode, b.status, b.due_date, b.tag || null, id, req.userId!,
      );
      await replaceSplits(tdb, id, b.split_mode, b.amount, members);
    });
    res.json(await loadExpense(req.userId!, id));
  });

  api.patch('/expenses/:id/status', async (req, res) => {
    const { status } = z.object({ status: z.enum(EXPENSE_STATUS) }).parse(req.body);
    const r = await run(db, 'UPDATE expenses SET status = ? WHERE id = ? AND user_id = ?', status, Number(req.params.id), req.userId!);
    if (!r.changes) throw new HttpError(404, 'Gasto não encontrado.');
    res.json(await loadExpense(req.userId!, Number(req.params.id)));
  });

  api.delete('/expenses/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (req.query.all === '1') {
      const row = await get<{ installment_group: string | null }>(
        db,
        'SELECT installment_group FROM expenses WHERE id = ? AND user_id = ?',
        id,
        req.userId!,
      );
      if (!row) throw new HttpError(404, 'Gasto não encontrado.');
      if (row.installment_group) {
        const r = await run(db, 'DELETE FROM expenses WHERE installment_group = ? AND user_id = ?', row.installment_group, req.userId!);
        res.json({ ok: true, deleted: r.changes });
        return;
      }
    }
    const r = await run(db, 'DELETE FROM expenses WHERE id = ? AND user_id = ?', id, req.userId!);
    if (!r.changes) throw new HttpError(404, 'Gasto não encontrado.');
    res.json({ ok: true, deleted: 1 });
  });

  api.post('/expenses/duplicate-fixed', async (req, res) => {
    const b = z.object({ to: monthParam, from: monthParam.optional() }).parse(req.body);
    const from = b.from ?? prevMonth(b.to);
    if (from === b.to) throw new HttpError(400, 'Escolha meses diferentes.');
    const result = await tx(db, (tdb) => duplicateFixed(tdb, req.userId!, from, b.to));
    res.json({ ...result, from, to: b.to });
  });

  /* ---------------- Tags (atalhos para gastos do dia a dia) ---------------- */
  api.get('/tags', async (req, res) => {
    res.json(await all(db, 'SELECT id, name, category, default_amount, created_at FROM expense_tags WHERE user_id = ? ORDER BY id', req.userId!));
  });

  api.post('/tags', async (req, res) => {
    const b = tagBody.parse(req.body);
    if (await get(db, 'SELECT 1 AS x FROM expense_tags WHERE user_id = ? AND name = ?', req.userId!, b.name)) {
      throw new HttpError(409, 'Você já tem uma tag com esse nome.');
    }
    const id = await insert(db, 'INSERT INTO expense_tags (user_id, name, category, default_amount) VALUES (?,?,?,?)', req.userId!, b.name, b.category, b.default_amount);
    res.status(201).json(await get(db, 'SELECT id, name, category, default_amount, created_at FROM expense_tags WHERE id = ?', id));
  });

  api.put('/tags/:id', async (req, res) => {
    const b = tagBody.parse(req.body);
    const id = Number(req.params.id);
    const clash = await get<{ id: number }>(db, 'SELECT id FROM expense_tags WHERE user_id = ? AND name = ?', req.userId!, b.name);
    if (clash && clash.id !== id) throw new HttpError(409, 'Você já tem uma tag com esse nome.');
    const r = await run(db, 'UPDATE expense_tags SET name = ?, category = ?, default_amount = ? WHERE id = ? AND user_id = ?', b.name, b.category, b.default_amount, id, req.userId!);
    if (!r.changes) throw new HttpError(404, 'Tag não encontrada.');
    res.json(await get(db, 'SELECT id, name, category, default_amount, created_at FROM expense_tags WHERE id = ?', id));
  });

  api.delete('/tags/:id', async (req, res) => {
    const r = await run(db, 'DELETE FROM expense_tags WHERE id = ? AND user_id = ?', Number(req.params.id), req.userId!);
    if (!r.changes) throw new HttpError(404, 'Tag não encontrada.');
    res.json({ ok: true });
  });

  /* ---------------- Reservas ---------------- */
  const reserveOwned = async (userId: number, id: number) => {
    const r = await get<{ id: number; current_amount: number }>(db, 'SELECT * FROM reserves WHERE id = ? AND user_id = ?', id, userId);
    if (!r) throw new HttpError(404, 'Reserva não encontrada.');
    return r;
  };

  api.get('/reserves', async (req, res) => {
    const reserves = await all<{ id: number }>(db, 'SELECT * FROM reserves WHERE user_id = ? ORDER BY id', req.userId!);
    const contrib = await all<{ reserve_id: number; member_id: number; name: string; total: number | string }>(
      db,
      `SELECT t.reserve_id, t.member_id, m.name,
              SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE -t.amount END) AS total
         FROM reserve_transactions t JOIN household_members m ON m.id = t.member_id
         JOIN reserves r ON r.id = t.reserve_id
        WHERE r.user_id = ? GROUP BY t.reserve_id, t.member_id, m.name ORDER BY total DESC`,
      req.userId!,
    );
    res.json(
      reserves.map((r) => ({
        ...r,
        contributions: contrib
          .filter((c) => c.reserve_id === r.id)
          .map((c) => ({ member_id: c.member_id, name: c.name, total: fromCents(toCents(Number(c.total))) })),
      })),
    );
  });

  api.post('/reserves', async (req, res) => {
    const b = reserveBody.extend({ current_amount: money().refine((v) => v >= 0).default(0) }).parse(req.body);
    const id = await insert(
      db,
      'INSERT INTO reserves (user_id, name, kind, target_amount, current_amount) VALUES (?,?,?,?,?)',
      req.userId!, b.name, b.kind, b.target_amount, b.current_amount,
    );
    res.status(201).json(await get(db, 'SELECT * FROM reserves WHERE id = ?', id));
  });

  api.put('/reserves/:id', async (req, res) => {
    const b = reserveBody.parse(req.body);
    const id = Number(req.params.id);
    await reserveOwned(req.userId!, id);
    await run(db, 'UPDATE reserves SET name = ?, kind = ?, target_amount = ? WHERE id = ?', b.name, b.kind, b.target_amount, id);
    res.json(await get(db, 'SELECT * FROM reserves WHERE id = ?', id));
  });

  api.delete('/reserves/:id', async (req, res) => {
    await reserveOwned(req.userId!, Number(req.params.id));
    await run(db, 'DELETE FROM reserves WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  });

  api.get('/reserves/:id/transactions', async (req, res) => {
    await reserveOwned(req.userId!, Number(req.params.id));
    res.json(
      await all(
        db,
        `SELECT t.id, t.amount, t.type, t.date, t.note, t.member_id, t.created_at, m.name AS member_name
           FROM reserve_transactions t LEFT JOIN household_members m ON m.id = t.member_id
          WHERE t.reserve_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 100`,
        Number(req.params.id),
      ),
    );
  });

  api.post('/reserves/:id/transactions', async (req, res) => {
    const b = txBody.parse(req.body);
    const id = Number(req.params.id);
    const reserve = await reserveOwned(req.userId!, id);
    if (b.member_id != null && !(await listMembers(db, req.userId!)).some((m) => m.id === b.member_id)) {
      throw new HttpError(400, 'Pessoa inválida.');
    }
    if (b.type === 'withdraw' && b.amount > reserve.current_amount + 0.001) {
      throw new HttpError(400, 'Você não pode retirar mais do que há guardado nesta reserva.');
    }
    const delta = b.type === 'deposit' ? b.amount : -b.amount;
    const nextAmount = Math.max(0, fromCents(toCents(reserve.current_amount) + toCents(delta)));
    await tx(db, async (tdb) => {
      await run(
        tdb,
        'INSERT INTO reserve_transactions (reserve_id, member_id, amount, type, date, note) VALUES (?,?,?,?,?,?)',
        id, b.member_id ?? null, b.amount, b.type, b.date ?? today(), b.note || null,
      );
      await run(tdb, 'UPDATE reserves SET current_amount = ? WHERE id = ?', nextAmount, id);
    });
    res.status(201).json(await get(db, 'SELECT * FROM reserves WHERE id = ?', id));
  });

  api.delete('/reserves/:id/transactions/:txId', async (req, res) => {
    const id = Number(req.params.id);
    const reserve = await reserveOwned(req.userId!, id);
    const t = await get<{ amount: number; type: string }>(db, 'SELECT amount, type FROM reserve_transactions WHERE id = ? AND reserve_id = ?', Number(req.params.txId), id);
    if (!t) throw new HttpError(404, 'Movimentação não encontrada.');
    const delta = t.type === 'deposit' ? -t.amount : t.amount;
    if (reserve.current_amount + delta < -0.001) {
      throw new HttpError(400, 'Não dá para desfazer: o saldo da reserva ficaria negativo.');
    }
    const nextAmount = Math.max(0, fromCents(toCents(reserve.current_amount) + toCents(delta)));
    await tx(db, async (tdb) => {
      await run(tdb, 'DELETE FROM reserve_transactions WHERE id = ?', Number(req.params.txId));
      await run(tdb, 'UPDATE reserves SET current_amount = ? WHERE id = ?', nextAmount, id);
    });
    res.json({ ok: true });
  });

  /* ---------------- Painel ---------------- */
  api.get('/summary', async (req, res) => {
    const month = monthParam.parse(req.query.month ?? currentMonth());
    res.json(await buildSummary(db, req.userId!, month, today()));
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
