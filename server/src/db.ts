import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  has_demo_data INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS household_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_income REAL NOT NULL DEFAULT 0 CHECK (monthly_income >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fixed','variable')),
  split_mode TEXT NOT NULL CHECK (split_mode IN ('individual','equal','proportional')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid','pending')),
  due_date TEXT NOT NULL,
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
`;

export function openDb(file?: string): Db {
  let target = file ?? process.env.DB_PATH;
  if (!target) {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
    fs.mkdirSync(dir, { recursive: true });
    target = path.join(dir, 'financas.db');
  }
  const db = new DatabaseSync(target);
  db.exec('PRAGMA foreign_keys = ON;');
  if (target !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function all<T>(db: Db, sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
export function get<T>(db: Db, sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}
export function run(db: Db, sql: string, ...params: (string | number | null)[]) {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
}

/** Executa `fn` dentro de uma transação (desfaz tudo se der erro). */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
