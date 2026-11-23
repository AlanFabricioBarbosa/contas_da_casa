import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';

export type Param = string | number | null;

export interface Db {
  kind: 'sqlite' | 'pg';
  sqlite?: DatabaseSync;
  pool?: Pool;
  client?: PoolClient;
}

const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  has_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pending_registrations (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS household_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_income REAL NOT NULL DEFAULT 0 CHECK (monthly_income >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed','variable')),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily','weekly','monthly')),
  split_mode TEXT NOT NULL CHECK (split_mode IN ('individual','equal','proportional')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','pending')),
  due_date TEXT NOT NULL,
  tag TEXT,
  installment_group TEXT,
  installment_num INTEGER,
  installment_total INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_month ON expenses(user_id, month_year);

CREATE TABLE IF NOT EXISTS expense_splits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
  assigned_amount REAL NOT NULL,
  UNIQUE (expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS reserves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('emergency','annual','goal','other')),
  target_amount REAL NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  current_amount REAL NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reserve_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reserve_id INTEGER NOT NULL REFERENCES reserves(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES household_members(id) ON DELETE SET NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('deposit','withdraw')),
  date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rtx_reserve ON reserve_transactions(reserve_id, date);
CREATE TABLE IF NOT EXISTS extra_incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_extra_user_month ON extra_incomes(user_id, month_year);
CREATE TABLE IF NOT EXISTS expense_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  default_amount REAL NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);
`;

const SCHEMA_PG = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  has_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pending_registrations (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS household_members (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_income DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (monthly_income >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  title TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed','variable')),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily','weekly','monthly')),
  split_mode TEXT NOT NULL CHECK (split_mode IN ('individual','equal','proportional')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','pending')),
  due_date TEXT NOT NULL,
  tag TEXT,
  installment_group TEXT,
  installment_num INTEGER,
  installment_total INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_user_month ON expenses(user_id, month_year);

CREATE TABLE IF NOT EXISTS expense_splits (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
  assigned_amount DOUBLE PRECISION NOT NULL,
  UNIQUE (expense_id, member_id)
);

CREATE TABLE IF NOT EXISTS reserves (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('emergency','annual','goal','other')),
  target_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (target_amount >= 0),
  current_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reserve_transactions (
  id SERIAL PRIMARY KEY,
  reserve_id INTEGER NOT NULL REFERENCES reserves(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES household_members(id) ON DELETE SET NULL,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('deposit','withdraw')),
  date TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rtx_reserve ON reserve_transactions(reserve_id, date);

CREATE TABLE IF NOT EXISTS extra_incomes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  title TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL CHECK (amount > 0),
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_extra_user_month ON extra_incomes(user_id, month_year);

CREATE TABLE IF NOT EXISTS expense_tags (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  default_amount DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_group TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_num INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS installment_total INTEGER;
ALTER TABLE household_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
`;

function toPgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function openDb(file?: string): Promise<Db> {
  const databaseUrl = file ? undefined : process.env.DATABASE_URL;
  if (databaseUrl) {
    const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    await pool.query(SCHEMA_PG);
    return { kind: 'pg', pool };
  }

  let target = file ?? process.env.DB_PATH;
  if (!target) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
    fs.mkdirSync(dir, { recursive: true });
    target = path.join(dir, 'financas.db');
  }
  const sqlite = new DatabaseSync(target);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (target !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec(SCHEMA_SQLITE);
  const cols = sqlite.prepare('PRAGMA table_info(expenses)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'tag')) sqlite.exec('ALTER TABLE expenses ADD COLUMN tag TEXT');
  if (!cols.some((c) => c.name === 'frequency')) {
    sqlite.exec("ALTER TABLE expenses ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'");
  }
  if (!cols.some((c) => c.name === 'installment_group')) sqlite.exec('ALTER TABLE expenses ADD COLUMN installment_group TEXT');
  if (!cols.some((c) => c.name === 'installment_num')) sqlite.exec('ALTER TABLE expenses ADD COLUMN installment_num INTEGER');
  if (!cols.some((c) => c.name === 'installment_total')) sqlite.exec('ALTER TABLE expenses ADD COLUMN installment_total INTEGER');
  const mCols = sqlite.prepare('PRAGMA table_info(household_members)').all() as { name: string }[];
  if (!mCols.some((c) => c.name === 'updated_at')) sqlite.exec('ALTER TABLE household_members ADD COLUMN updated_at TEXT');
  return { kind: 'sqlite', sqlite };
}

export async function all<T>(db: Db, sql: string, ...params: Param[]): Promise<T[]> {
  if (db.kind === 'pg') {
    const runner = db.client ?? db.pool!;
    const res = await runner.query(toPgSql(sql), params);
    return res.rows as T[];
  }
  return db.sqlite!.prepare(sql).all(...params) as T[];
}

export async function get<T>(db: Db, sql: string, ...params: Param[]): Promise<T | undefined> {
  if (db.kind === 'pg') {
    const rows = await all<T>(db, sql, ...params);
    return rows[0];
  }
  return db.sqlite!.prepare(sql).get(...params) as T | undefined;
}

export async function run(db: Db, sql: string, ...params: Param[]): Promise<{ changes: number }> {
  if (db.kind === 'pg') {
    const runner = db.client ?? db.pool!;
    const res = await runner.query(toPgSql(sql), params);
    return { changes: res.rowCount ?? 0 };
  }
  const r = db.sqlite!.prepare(sql).run(...params);
  return { changes: Number(r.changes) };
}

export async function insert(db: Db, sql: string, ...params: Param[]): Promise<number> {
  if (db.kind === 'pg') {
    const runner = db.client ?? db.pool!;
    const res = await runner.query(`${toPgSql(sql)} RETURNING id`, params);
    return Number((res.rows[0] as { id: number | string }).id);
  }
  const r = db.sqlite!.prepare(sql).run(...params);
  return Number(r.lastInsertRowid);
}

/** Executa `fn` dentro de uma transação (desfaz tudo se der erro). */
export async function tx<T>(db: Db, fn: (txDb: Db) => Promise<T>): Promise<T> {
  if (db.kind === 'pg') {
    if (db.client) return fn(db);
    const client = await db.pool!.connect();
    try {
      await client.query('BEGIN');
      const out = await fn({ kind: 'pg', pool: db.pool, client });
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  db.sqlite!.exec('BEGIN');
  try {
    const out = await fn(db);
    db.sqlite!.exec('COMMIT');
    return out;
  } catch (e) {
    db.sqlite!.exec('ROLLBACK');
    throw e;
  }
}
