/* Today is 15 Oct 2026 unless a test says otherwise. Day counts are calendar days. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { expiryFlag } from '../../public/js/core.js';

const TODAY = new Date(2026, 9, 15, 14, 30);
const flag = (remark, month = '2026-10', today = TODAY) => expiryFlag(remark, month, today);

test('30 days out warns, 31 does not', () => {
  assert.deepEqual(flag('Expiry: Nov 14, 2026'), { cls: 'warn', t: '⚠ Due in 30 days.' }); // 16 days left in Oct + 14
  assert.equal(flag('Expiry: Nov 15, 2026'), null);
});
test('one day out says "1 day"', () => assert.equal(flag('Oct 16, 2026').t, '⚠ Due in 1 day.'));
test('today', () => assert.deepEqual(flag('Oct 15, 2026'), { cls: 'warn', t: '⚠ This date is today. Confirm the renewal.' }));
test('date passed', () => {
  assert.deepEqual(flag('Oct 14, 2026'), { cls: 'bad', t: '⚠ Date passed 1 day ago. Check and update this remark.' });
  assert.equal(flag('Oct 13, 2026').t, '⚠ Date passed 2 days ago. Check and update this remark.');
  assert.equal(flag('Oct 13, 2026').cls, 'bad');
});
test('far-off dates are fine', () => assert.equal(flag('Auto Renews: Aug 10, 2027'), null));
test('month names, abbreviations and punctuation', () => {
  for (const r of ['Oct 20, 2026', 'October 20, 2026', 'oct 20 2026', 'Oct. 20, 2026', 'Auto Renews: Oct 20, 2026', 'SSL expires OCT 20, 2026']) assert.equal(flag(r).t, '⚠ Due in 5 days.', r);
  assert.equal(flag('Sept 20, 2026').t, '⚠ Date passed 25 days ago. Check and update this remark.'); // 4-letter "Sept" is read as September: 10 left in Sep + 15 in Oct = 25
});
test('text with no usable date gives no flag', () => {
  for (const r of ['', undefined, null, 'Will be taken care of i-Net Concepts', '2026-10-20', 'Oct 2026', 'Foo 20, 2026', 'Oct 20']) assert.equal(flag(r), null, String(r));
});
test('⚠ a day-first date such as "20 Oct 2026"', { todo: 'open question, see tests/BUGS.md Q5' }, () => {
  assert.equal(flag('20 Oct 2026').t, '⚠ Due in 5 days.');
});
test('BUG-2: a day that does not exist is not a date', { todo: 'see tests/BUGS.md BUG-2' }, () => {
  assert.equal(flag('Oct 32, 2026'), null);
  assert.equal(flag('Feb 30, 2027'), null);
});
test('only reports from last month onwards are checked', () => {
  assert.equal(flag('Oct 1, 2026', '2026-08'), null);                 // two months old: ignored even though the date passed
  assert.equal(flag('Oct 1, 2026', '2026-09').cls, 'bad');            // last month: checked
  assert.equal(flag('Oct 1, 2026', '2026-10').cls, 'bad');
  assert.equal(flag('Oct 1, 2026', '2026-11').cls, 'bad');            // future months: checked
});
test('works across the year end', () => {
  const today = new Date(2026, 11, 20);
  assert.equal(flag('Jan 5, 2027', '2026-12', today).t, '⚠ Due in 16 days.'); // 11 left in Dec + 5
  assert.equal(flag('Jan 5, 2027', '2026-10', today), null);                  // report older than last month
  assert.equal(flag('Dec 31, 2026', '2026-11', today).t, '⚠ Due in 11 days.'); // 'last month' = Nov, still checked
});
