/* Run under TZ=Asia/Kolkata and TZ=America/Los_Angeles (npm run test:tz). Dates use local-time constructors. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { amcState, monthAfterAmc } from '../../public/js/core.js';

const c = { amcStart: '2026-01-01', amcEnd: '2026-11-08' };
const d = (y, m, day, h = 0, mi = 0, s = 0) => new Date(y, m - 1, day, h, mi, s);

test('the AMC end date itself is still inside the AMC', () => {
  assert.deepEqual(amcState(c, d(2026, 11, 8)), { ended: false, days: 0, warn: true });
  assert.equal(amcState(c, d(2026, 11, 8, 23, 59, 59)).ended, false);
});
test('the day after the end date is ended', () => {
  assert.deepEqual(amcState(c, d(2026, 11, 9)), { ended: true, days: -1, warn: false });
  assert.equal(amcState(c, d(2026, 11, 9, 0, 0, 1)).ended, true);
});
test('the warning starts exactly 3 months before the end date', () => {
  assert.equal(amcState(c, d(2026, 8, 8)).warn, true);   // 8 Aug + 3 months = 8 Nov
  assert.equal(amcState(c, d(2026, 8, 8)).days, 92);     // Aug 8 -> Nov 8: 23 + 30 + 31 + 8 = 92
  assert.equal(amcState(c, d(2026, 8, 7)).warn, false);
  assert.equal(amcState(c, d(2026, 8, 7)).days, 93);
});
test('far from the end there is no warning', () => {
  assert.deepEqual(amcState(c, d(2026, 1, 1)), { ended: false, days: 311, warn: false });
});
test('days are whole calendar days even when the clocks change', () => {
  // US clocks go back on 1 Nov 2026 (a 25-hour day) and forward on 8 Mar 2026 (a 23-hour day). India has no change.
  assert.equal(amcState({ amcEnd: '2026-11-02' }, d(2026, 10, 31)).days, 2);
  assert.equal(amcState({ amcEnd: '2026-03-09' }, d(2026, 3, 7)).days, 2);
  assert.equal(amcState({ amcEnd: '2026-11-02' }, d(2026, 10, 31, 23, 30)).days, 2);
});
test('the time of day does not change the answer', () => {
  for (const [h, m] of [[0, 0], [6, 30], [12, 0], [23, 59]]) assert.deepEqual(amcState(c, d(2026, 10, 1, h, m)), amcState(c, d(2026, 10, 1)));
});

test('monthAfterAmc: the final month is allowed, the month after is blocked', () => {
  assert.equal(monthAfterAmc(c, '2026-10'), false);
  assert.equal(monthAfterAmc(c, '2026-11'), false);
  assert.equal(monthAfterAmc(c, '2026-12'), true);
  assert.equal(monthAfterAmc(c, '2027-01'), true);
});
test('monthAfterAmc on a year-end AMC', () => {
  const y = { amcEnd: '2026-12-31' };
  assert.equal(monthAfterAmc(y, '2026-12'), false);
  assert.equal(monthAfterAmc(y, '2027-01'), true);
});

test('⚠ a month before the AMC start', { todo: 'open question, see tests/BUGS.md Q4' }, () => {
  assert.equal(monthAfterAmc({ amcStart: '2026-05-08', amcEnd: '2027-05-08' }, '2026-04'), true);
});
test('BUG-3: "3 months" from a month-end date', { todo: 'see tests/BUGS.md BUG-3' }, () => {
  // 30 Nov 2026 + 3 months is 28 Feb 2027, so an AMC ending 1 Mar 2027 is outside the last 3 months.
  assert.equal(amcState({ amcEnd: '2027-03-01' }, d(2026, 11, 30)).warn, false);
  assert.equal(amcState({ amcEnd: '2027-02-28' }, d(2026, 11, 30)).warn, true);
});
