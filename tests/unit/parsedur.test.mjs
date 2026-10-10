import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDur, fmtDur, shortDur } from '../../public/js/core.js';

/* Questions the code leaves open are marked todo and listed in tests/BUGS.md. They stay visible until someone decides. */

test('parseDur reads the formats the reports use', () => {
  const cases = { '50': 50, '1h 15m': 75, '1:15': 75, '2 hrs': 120, '3 hrs 20 mins': 200, '1hr 15mins': 75, '90m': 90, '1h': 60, '  50 ': 50, '0': 0, '0m': 0, '1 hr, 5 mins': 65, '2 hours and 5 minutes': 125 };
  for (const [input, mins] of Object.entries(cases)) assert.equal(parseDur(input), mins, JSON.stringify(input));
});

test('parseDur: a bare number is minutes, or hours when asked', () => {
  assert.equal(parseDur('8'), 8);
  assert.equal(parseDur('8', 'h'), 480);
  assert.equal(parseDur('8', 'm'), 8);
});

test('parseDur reads decimal hours', () => {
  assert.equal(parseDur('1.5h'), 90);
  assert.equal(parseDur('0.5h'), 30);
  assert.equal(parseDur('1.25 hrs'), 75);
});

test('parseDur: empty means no time', () => {
  assert.equal(parseDur(''), 0);
  assert.equal(parseDur(null), 0);
  assert.equal(parseDur(undefined), 0);
  assert.equal(parseDur('   '), 0);
});

test('parseDur rejects text it cannot read', () => {
  for (const input of ['abc', 'h', '1h 5x', '1h h', '5 apples', '1:xx', '1h 15']) assert.ok(Number.isNaN(parseDur(input)), JSON.stringify(input));
});

test('parseDur rejects negative times', () => {
  for (const input of ['-5', '-1h', '-1:15', '-0.5h']) assert.ok(Number.isNaN(parseDur(input)), JSON.stringify(input));
});

test('⚠ "1h30" (no unit after the minutes)', { todo: 'open question, see tests/BUGS.md Q1' }, () => {
  assert.equal(parseDur('1h30'), 90);
});
test('⚠ bare decimal "1.5" (minutes or hours?)', { todo: 'open question, see tests/BUGS.md Q2' }, () => {
  assert.equal(parseDur('1.5'), 90);
});
test('⚠ "1:75" (75 is not a valid minute count)', { todo: 'open question, see tests/BUGS.md Q3' }, () => {
  assert.ok(Number.isNaN(parseDur('1:75')));
});

test('fmtDur words', () => {
  const cases = { 0: '0 mins', 1: '1 min', 50: '50 mins', 60: '1 hr', 75: '1 hr 15 mins', 120: '2 hrs', 125: '2 hrs 5 mins', 301: '5 hrs 1 min', '-75': '-1 hr 15 mins' };
  for (const [mins, text] of Object.entries(cases)) assert.equal(fmtDur(+mins), text);
});
test('shortDur words', () => {
  const cases = { 50: '50m', 60: '1h', 75: '1h 15m', 0: '0m' };
  for (const [mins, text] of Object.entries(cases)) assert.equal(shortDur(+mins), text);
});
test('fmtDur and parseDur agree on the reports\' own figures', () => {
  for (const m of [0, 1, 50, 75, 330, 425, 600]) assert.equal(parseDur(shortDur(m)), m);
});
