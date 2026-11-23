import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, calcSplits } from './money.js';
import { shiftMonth, addDays } from './dates.js';

test('allocate não perde centavos', () => {
  const parts = allocate(10000, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 10000);
  assert.deepEqual(parts, [3334, 3333, 3333]);
});

test('divisão proporcional segue o peso da renda', () => {
  const r = calcSplits('proportional', 1000, [
    { id: 1, income: 3000 },
    { id: 2, income: 1000 },
  ]);
  assert.deepEqual(r, [
    { member_id: 1, assigned_amount: 750 },
    { member_id: 2, assigned_amount: 250 },
  ]);
});

test('proporcional com rendas zeradas cai para divisão igual', () => {
  const r = calcSplits('proportional', 100, [
    { id: 1, income: 0 },
    { id: 2, income: 0 },
  ]);
  assert.deepEqual(r.map((x) => x.assigned_amount), [50, 50]);
});

test('divisão igual e individual', () => {
  assert.deepEqual(
    calcSplits('equal', 100.01, [{ id: 1, income: 0 }, { id: 2, income: 0 }]).map((x) => x.assigned_amount),
    [50.01, 50],
  );
  assert.deepEqual(calcSplits('individual', 80, [{ id: 7, income: 1 }]), [{ member_id: 7, assigned_amount: 80 }]);
});

test('datas', () => {
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(addDays('2026-11-28', 5), '2026-12-03');
});
