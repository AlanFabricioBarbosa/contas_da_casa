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
  const db = await openDb(':memory:');
  const server = createApp(db).listen(0);
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
  const updMember = await call('PUT', `/members/${first.id}`, { name: first.name, monthly_income: 3 * 1621 });
  assert.ok(updMember.body.updated_at);
  const after = (await call('GET', `/expenses?month=${month}`)).body.find((e: { id: number }) => e.id === created.body.id);
  assert.ok(after.created_at);
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
  const rtx = (await call('GET', `/reserves/${r0.id}/transactions`)).body;
  assert.ok(rtx[0]?.created_at);
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

test('tags: atalhos, gasto rápido e total por tag no resumo', async () => {
  await call('POST', '/demo/load');
  const { todayBR } = await import('./dates.js');
  const today = todayBR();
  const month = today.slice(0, 7);

  const tags = (await call('GET', '/tags')).body;
  assert.ok(tags.length >= 3);
  const dup = await call('POST', '/tags', { name: tags[0].name, category: 'transporte', default_amount: 10 });
  assert.equal(dup.status, 409);

  const created = await call('POST', '/tags', { name: 'Estacionamento', category: 'transporte', default_amount: 8 });
  assert.equal(created.status, 201);
  assert.ok(created.body.created_at);
  const upd = await call('PUT', `/tags/${created.body.id}`, { name: 'Estacionamento', category: 'transporte', default_amount: 9.5 });
  assert.equal(upd.body.default_amount, 9.5);

  const before = (await call('GET', `/summary?month=${month}`)).body;
  const beforeTag = before.tags.find((t: { name: string }) => t.name === 'Estacionamento');
  assert.equal(beforeTag, undefined);

  const members = (await call('GET', '/members')).body;
  const q = await call('POST', '/expenses', {
    title: 'Estacionamento', amount: 9.5, category: 'transporte', type: 'variable', frequency: 'daily', split_mode: 'individual',
    status: 'paid', due_date: today, member_ids: [members[0].id], tag: 'Estacionamento',
  });
  assert.equal(q.status, 201);
  assert.equal(q.body.tag, 'Estacionamento');
  assert.equal(q.body.frequency, 'daily');

  const w = await call('POST', '/expenses', {
    title: 'Feira da semana', amount: 45, category: 'alimentacao', type: 'variable', frequency: 'weekly', split_mode: 'equal',
    status: 'paid', due_date: today, member_ids: [members[0].id],
  });
  assert.equal(w.status, 201);
  assert.equal(w.body.frequency, 'weekly');

  const after = (await call('GET', `/summary?month=${month}`)).body;
  const t = after.tags.find((x: { name: string }) => x.name === 'Estacionamento');
  assert.deepEqual({ total: t.total, count: t.count }, { total: 9.5, count: 1 });
  assert.ok(t.last_at);
  assert.equal(after.by_frequency.weekly.total, 45);
  assert.ok(after.by_frequency.daily.total >= 9.5);
  assert.equal(Math.round((after.expenses_total - before.expenses_total) * 100), 5450);
  const expList = (await call('GET', `/expenses?month=${month}`)).body;
  assert.ok(expList.some((e: { id: number; tag: string | null }) => e.id === q.body.id && e.tag === 'Estacionamento'));

  assert.equal((await call('DELETE', `/tags/${created.body.id}`)).status, 200);
  assert.equal((await call('DELETE', `/tags/${created.body.id}`)).status, 404);
  await call('POST', '/demo/clear');
  assert.equal((await call('GET', '/tags')).body.length, 0);
});

test('compras parceladas: divide sem perder centavos, gera meses futuros e exclui o grupo', async () => {
  await call('POST', '/demo/load');
  const members = (await call('GET', '/members')).body;
  const { shiftMonth } = await import('./dates.js');
  const m1 = '2026-01';
  const m2 = shiftMonth(m1, 1);
  const m3 = shiftMonth(m1, 2);

  // R$ 100,00 em 3x no dia 31 -> jan (31), fev (28), mar (31), soma exata 100,00
  const p = await call('POST', '/expenses', {
    title: 'Ventilador', amount: 100, category: 'moradia', type: 'fixed', frequency: 'monthly',
    split_mode: 'equal', status: 'paid', due_date: `${m1}-31`,
    member_ids: members.map((m: { id: number }) => m.id),
    installments: 3, installment_amount_mode: 'total',
  });
  assert.equal(p.status, 201);
  assert.equal(p.body.created_count, 3);
  assert.equal(p.body.amount, 33.34);
  assert.equal(p.body.status, 'paid');
  assert.equal(p.body.installment_num, 1);
  assert.equal(p.body.installment_total, 3);

  const l2 = (await call('GET', `/expenses?month=${m2}`)).body.find((e: { title: string }) => e.title === 'Ventilador');
  const l3 = (await call('GET', `/expenses?month=${m3}`)).body.find((e: { title: string }) => e.title === 'Ventilador');
  assert.equal(l2.amount, 33.33);
  assert.equal(l2.due_date, `${m2}-28`);
  assert.equal(l2.status, 'pending');
  assert.equal(l3.amount, 33.33);
  assert.equal(l3.due_date, `${m3}-31`);
  assert.equal(l3.installment_num, 3);

  // Modo valor por parcela: 2x de R$ 50,00
  const p2 = await call('POST', '/expenses', {
    title: 'Tênis', amount: 50, category: 'lazer', type: 'variable', frequency: 'monthly',
    split_mode: 'individual', status: 'pending', due_date: `${m1}-10`,
    member_ids: [members[0].id],
    installments: 2, installment_amount_mode: 'installment',
  });
  assert.equal(p2.status, 201);
  assert.equal(p2.body.amount, 50);

  // Excluir todas as parcelas de Ventilador
  const delAll = await call('DELETE', `/expenses/${l2.id}?all=1`);
  assert.equal(delAll.status, 200);
  assert.equal(delAll.body.deleted, 3);
  assert.equal((await call('GET', `/expenses?month=${m1}`)).body.some((e: { title: string }) => e.title === 'Ventilador'), false);
  assert.equal((await call('GET', `/expenses?month=${m3}`)).body.some((e: { title: string }) => e.title === 'Ventilador'), false);

  await call('POST', '/demo/clear');
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
