import test from 'node:test';
import assert from 'node:assert/strict';
import { hoursFor, carryForward, fmtDur, addMonth, monthLabel } from '../../public/js/core.js';
import { clients, reports, expected, list } from '../fixtures/synthetic.mjs';

const figures = (id, month, l = list(id)) => { const h = hoursFor(clients[id], l, month); return [h.prev, h.used, h.consumed, h.remaining]; };

test('every fixture month matches the hand-calculated balances (see tests/fixtures/synthetic.mjs)', () => {
  for (const [id, months] of Object.entries(expected)) for (const [month, want] of Object.entries(months)) assert.deepEqual(figures(id, month), want, id + ' ' + month);
});

test('the order reports were saved in does not matter for hoursFor', () => {
  for (const id of Object.keys(clients)) {
    const l = list(id), shuffled = [l[2], l[0], l[3], l[1]];
    for (const [month, want] of Object.entries(expected[id])) assert.deepEqual(figures(id, month, shuffled), want, id + ' ' + month);
  }
});

test('deleting an earlier month moves every later balance', () => {
  // Alpha without July: before September = 50 (Jun) + 120 (Aug) = 170, so prev 430, used 50, consumed 220, remaining 380
  const without = list('alpha').filter(r => r.month !== '2026-07');
  assert.deepEqual(figures('alpha', '2026-09', without), [430, 50, 220, 380]);
  // and the same month with July still saved is unchanged
  assert.deepEqual(figures('alpha', '2026-09'), [380, 50, 270, 330]);
});

test('a skipped month uses no minutes and the balance moves on unchanged', () => {
  assert.deepEqual(figures('bravo', '2026-07'), [430, 0, 50, 430]);
  assert.equal(figures('bravo', '2026-08')[0], figures('bravo', '2026-07')[3]); // Aug opens with what Jul closed with
});

test('over-allocation gives a negative remaining balance', () => {
  // Charlie: prev for Oct is 0 (300 - 4 x 75). Using 75 more leaves 0 - 75 = -75.
  const l = [...list('charlie'), { month: '2026-10', work: [{ label: 'AMC Activities', kind: 'amc', mins: 75 }], acts: [], summary: '' }];
  assert.deepEqual(figures('charlie', '2026-10', l), [0, 75, 375, -75]);
  assert.equal(fmtDur(-75), '-1 hr 15 mins');
});

test('a month with nothing saved still shows the right opening balance', () => {
  assert.deepEqual(figures('alpha', '2026-10'), [330, 0, 270, 330]);
  assert.deepEqual(figures('alpha', '2026-05'), [600, 0, 0, 600]); // before any report
});

test('carryForward reports what the last saved report left behind', () => {
  const k = carryForward(clients.alpha, list('alpha'), '2026-10');
  assert.equal(k.last, '2026-09');
  assert.deepEqual(k.figures, { prev: 380, used: 50, consumed: 270, remaining: 330 });
  assert.equal(k.start, 330);
  assert.equal(k.gap, 0);
  assert.equal(k.skipped, false);
});

test('carryForward after a skipped month says so', () => {
  const k = carryForward(clients.bravo, list('bravo').filter(r => r.month <= '2026-07'), '2026-08');
  assert.equal(k.last, '2026-07');
  assert.equal(k.skipped, true);
  assert.equal(k.skipReason, 'Client could not share the OTP');
  assert.equal(k.start, 430);
  assert.equal(k.gap, 0);
});

test('carryForward counts months with no saved report as a gap', () => {
  // Alpha's last report is Sep. For Dec, Oct and Nov are missing: gap 2. For Nov: gap 1. For Oct: gap 0.
  assert.equal(carryForward(clients.alpha, list('alpha'), '2026-12').gap, 2);
  assert.equal(carryForward(clients.alpha, list('alpha'), '2026-11').gap, 1);
  assert.equal(carryForward(clients.alpha, list('alpha'), '2026-10').gap, 0);
  assert.equal(carryForward(clients.alpha, list('alpha'), '2026-12').start, 330); // missing months are not counted
});

test('carryForward crosses the year end', () => {
  const dec = { month: '2026-12', work: [{ label: 'AMC Activities', kind: 'amc', mins: 50 }], acts: [], summary: '' };
  const k = carryForward(clients.alpha, [...list('alpha'), dec], '2027-01');
  assert.equal(k.last, '2026-12');
  assert.equal(k.gap, 0);
  assert.equal(k.start, 280); // 600 - (50 + 50 + 120 + 50 + 50)
});

test('carryForward before any report starts from the full allocation', () => {
  assert.deepEqual(carryForward(clients.alpha, [], '2026-06'), { last: null, start: 600, gap: 0 });
  assert.deepEqual(carryForward(clients.alpha, list('alpha'), '2026-06'), { last: null, start: 600, gap: 0 });
});

test('BUG-1: carryForward does not depend on the order of the list', { todo: 'see tests/BUGS.md BUG-1' }, () => {
  const k = carryForward(clients.alpha, [...list('alpha')].reverse(), '2026-10');
  assert.equal(k.last, '2026-09');
  assert.equal(k.start, 330);
});

test('addMonth rolls over the year end in both directions', () => {
  const cases = [['2026-12', 1, '2027-01'], ['2027-01', -1, '2026-12'], ['2026-01', 13, '2027-02'], ['2026-03', -14, '2025-01'], ['2026-05', 0, '2026-05'], ['2026-11', 2, '2027-01']];
  for (const [ym, n, want] of cases) assert.equal(addMonth(ym, n), want, ym + ' + ' + n);
});
test('monthLabel', () => { assert.equal(monthLabel('2026-12'), 'December 2026'); assert.equal(monthLabel('2027-01'), 'January 2027'); });
