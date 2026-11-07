import test from 'node:test';
import assert from 'node:assert/strict';
import { reportFileName } from '../../public/js/core.js';

test('report file names follow Label-AMC-Report-Mon-YYYY', () => {
  assert.equal(reportFileName({ label: 'ABDF' }, '2026-10', false, 'pdf'), 'ABDF-AMC-Report-Oct-2026.pdf');
  assert.equal(reportFileName({ label: 'ABDF' }, '2026-11', false, 'docx'), 'ABDF-AMC-Report-Nov-2026.docx');
  assert.equal(reportFileName({ label: 'Beacon' }, '2027-01', false, 'pdf'), 'Beacon-AMC-Report-Jan-2027.pdf');
});
test('every month has its three-letter name', () => {
  const want = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  want.forEach((m, i) => assert.equal(reportFileName({ label: 'X' }, '2026-' + String(i + 1).padStart(2, '0'), false, 'pdf'), 'X-AMC-Report-' + m + '-2026.pdf'));
});
test('with earlier months included the name says "to"', () => {
  assert.equal(reportFileName({ label: 'ABDF' }, '2026-10', true, 'pdf'), 'ABDF-AMC-Report-to-Oct-2026.pdf');
});
test('spaces and symbols in the client name become hyphens', () => {
  assert.equal(reportFileName({ label: 'St Mary\'s & Co.' }, '2026-10', false, 'pdf'), 'St-Mary-s-Co-AMC-Report-Oct-2026.pdf');
});
