import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const COOKIE = 'cf_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

function loadSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.DB_PATH === ':memory:') return crypto.randomBytes(32).toString('hex');
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
  const file = path.join(dir, '.jwt-secret');
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function startSession(res: Response, userId: number) {
  const token = jwt.sign({ uid: userId }, SECRET, { expiresIn: MAX_AGE_S });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: MAX_AGE_S * 1000,
    path: '/',
  });
}

export function endSession(res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: number;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = readCookie(req, COOKIE);
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET) as { uid?: number };
      if (typeof payload.uid === 'number') {
        req.userId = payload.uid;
        return next();
      }
    } catch {
      /* cai no 401 */
    }
  }
  res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
}

/** Limitador simples em memória (por IP) para login/cadastro. */
const attempts = new Map<string, { n: number; reset: number }>();
export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const cur = attempts.get(key);
    if (!cur || cur.reset < now) {
      attempts.set(key, { n: 1, reset: now + windowMs });
      return next();
    }
    cur.n++;
    if (cur.n > max) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
      return;
    }
    next();
  };
}
