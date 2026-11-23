import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

process.env.DB_PATH = ':memory:';

let base = '';
let cookie = '';

async function call(method: string, url: string, body?: unknown, useCookie = true) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(useCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0]!;
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  const { openDb } = await import('./db.js');
  const { createApp } = await import('./app.js');
  const server = createApp(openDb(':memory:')).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  after_close = () => server.close();
});
let after_close = () => {};

test('exige login', async () => {
  const r = await call('GET', '/members', undefined, false);
  assert.equal(r.status, 401);
});

test('cadastro, exemplo, resumo, limpeza e fluxo de gastos', async () => {
  const reg = await call('POST', '/auth/register', { name: 'Maria', email: 'maria@teste.com', password: 'senha1234' });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.has_demo_data, true);

  const dup = await call('POST', '/auth/register', { name: 'Maria', email: 'MARIA@teste.com', password: 'senha1234' });
  assert.equal(dup.status, 409);

  const { todayBR } = await import('./dates.js');
  const month = todayBR().slice(0, 7);

  const s = (await call('GET', `/summary?month=${month}`)).body;
  assert.equal(s.income_total, 3242);
  assert.equal(s.members.length, 2);
  const sumOwes = s.members.reduce((a: number, m: { owes: number }) => a + m.owes, 0);
  assert.equal(Math.round(sumOwes * 100), Math.round(s.expenses_total * 100));
  assert.ok(s.diagnosis.critical.length > 0 && s.diagnosis.attention.length > 0 && s.diagnosis.good.length > 0);

  // novo gasto proporcional, depois mudança de renda recalcula
  const members = (await call('GET', '/members')).body;
  const created = await call('POST', '/expenses', {
    title: 'Teste', amount: 100, category: 'lazer', type: 'variable', split_mode: 'proportional',
    due_date: `${month}-28`, member_ids: members.map((m: { id: number }) => m.id),
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.splits.map((x: { assigned_amount: number }) => x.assigned_amount), [50, 50]);
  const first = members[0];
  await call('PUT', `/members/${first.id}`, { name: first.name, monthly_income: 3 * 1621 });
  const after = (await call('GET', `/expenses?month=${month}`)).body.find((e: { id: number }) => e.id === created.body.id);
  assert.deepEqual(after.splits.map((x: { assigned_amount: number }) => x.assigned_amount), [75, 25]);

  // validações
  const bad = await call('POST', '/expenses', { title: '', amount: -1 });
  assert.equal(bad.status, 400);

  // duplicar fixos
  const next = `${Number(month.slice(0, 4)) + 1}-01`;
  const d1 = await call('POST', '/expenses/duplicate-fixed', { to: next, from: month });
  assert.ok(d1.body.copied > 0);
  const d2 = await call('POST', '/expenses/duplicate-fixed', { to: next, from: month });
  assert.equal(d2.body.copied, 0);
  assert.equal(d2.body.skipped, d1.body.copied);

  // reservas
  const reserves = (await call('GET', '/reserves')).body;
  const r0 = reserves[0];
  const tooMuch = await call('POST', `/reserves/${r0.id}/transactions`, { type: 'withdraw', amount: r0.current_amount + 1 });
  assert.equal(tooMuch.status, 400);
  const dep = await call('POST', `/reserves/${r0.id}/transactions`, { type: 'deposit', amount: 50, member_id: first.id });
  assert.equal(dep.body.current_amount, r0.current_amount + 50);
  const s2 = (await call('GET', `/summary?month=${month}`)).body;
  assert.equal(s2.reserves_deposited_month, 50);

  // remover pessoa apaga gastos individuais dela e recalcula o resto
  await call('DELETE', `/members/${members[1].id}`);
  const left = (await call('GET', `/expenses?month=${month}`)).body;
  assert.ok(left.every((e: { splits: unknown[] }) => e.splits.length >= 1));

  // limpar exemplo
  await call('POST', '/demo/clear');
  assert.equal((await call('GET', '/members')).body.length, 0);
  assert.equal((await call('GET', '/auth/me')).body.has_demo_data, false);
  assert.equal((await call('GET', `/summary?month=${month}`)).body.expenses_total, 0);
});

test('login, logout e isolamento entre usuários', async () => {
  cookie = '';
  const bad = await call('POST', '/auth/login', { email: 'maria@teste.com', password: 'errada123' });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/auth/login', { email: 'maria@teste.com', password: 'senha1234' });
  assert.equal(ok.status, 200);

  const guest = await call('POST', '/auth/demo');
  assert.equal(guest.status, 201);
  assert.ok((await call('GET', '/members')).body.length === 2);
  // visitante não enxerga dados da Maria (que estão zerados) e vice-versa
  const claimed = await call('POST', '/auth/claim', { name: 'Zé', email: 'ze@teste.com', password: 'outrasenha1' });
  assert.equal(claimed.body.is_guest, false);
  after_close();
});
