/* The two full sentences below come from the reports prepared by hand (ABDF and Juzer, Sep 2026), i.e. the requirement. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { genSummary } from '../../public/js/core.js';

const ALL = ['Website Backup', 'Plugin Updates', 'Security & Malware Scan', 'Update Credentials', 'Domain Expiry Check', 'Hosting Expiry Check', 'SSL Expiry Check'];
const acts = (status = {}) => ALL.map(name => ({ name, status: status[name] || 'done' }));
const AMC = { label: 'AMC Activities', kind: 'amc', mins: 50 };
const LAST = 'The AMC hours utilized during this period have been recorded above, along with the remaining balance.';

test('all activities done', () => {
  assert.equal(genSummary({ note: '' }, acts(), [AMC]),
    'The maintenance activities scheduled for this reporting period have been completed. Activities including website backup, plugin updates, security & malware scan, update credentials, and domain, hosting, and SSL expiry checks were carried out as applicable. ' + LAST);
});

test('some activities not done', () => {
  const s = genSummary({ note: '' }, acts({ 'Plugin Updates': 'notdone', 'SSL Expiry Check': 'notdone' }), [AMC]);
  assert.match(s, /^Most of the maintenance activities scheduled for this reporting period have been completed\./);
  assert.match(s, /The following could not be completed this month: plugin updates and SSL expiry check\. Details are in the remarks above\./);
  assert.doesNotMatch(s, /plugin updates, /); // not listed as carried out
  assert.ok(s.endsWith(LAST));
});

test('N/A activities with the client note (Juzer)', () => {
  const note = 'Upon checking with i-Net Concepts regarding access to the domain, hosting, and SSL expiry details, they confirmed that the monitoring and renewal of these services will be handled by their team.';
  const s = genSummary({ note }, acts({ 'Domain Expiry Check': 'na', 'Hosting Expiry Check': 'na', 'SSL Expiry Check': 'na' }), [AMC]);
  assert.equal(s, 'The maintenance activities scheduled for this reporting period have been completed. Activities including website backup, plugin updates, security & malware scan, and update credentials were carried out as applicable. ' + note + ' ' + LAST);
});

test('N/A activities without a client note add nothing', () => {
  const s = genSummary({ note: '' }, acts({ 'Hosting Expiry Check': 'na' }), [AMC]);
  assert.match(s, /domain and SSL expiry checks were carried out/);
  assert.doesNotMatch(s, /hosting/);
});

test('the note is ignored when nothing is N/A', () => {
  assert.doesNotMatch(genSummary({ note: 'Renewals are handled elsewhere.' }, acts(), [AMC]), /Renewals are handled elsewhere/);
});

test('expiry checks are merged into one phrase', () => {
  const only = names => genSummary({ note: '' }, ALL.map(n => ({ name: n, status: names.includes(n) ? 'done' : 'na' })), [AMC]);
  assert.match(only(['Domain Expiry Check']), /Activities including domain expiry check were carried out/);
  assert.match(only(['Domain Expiry Check', 'SSL Expiry Check']), /Activities including domain and SSL expiry checks were/);
  assert.match(only(['Domain Expiry Check', 'Hosting Expiry Check', 'SSL Expiry Check']), /Activities including domain, hosting, and SSL expiry checks were/);
  assert.match(only(['Website Backup', 'SSL Expiry Check']), /Activities including website backup and SSL expiry check were/);
});

test('extra work is added as a sentence', () => {
  const one = genSummary({ note: '' }, acts(), [AMC, { label: 'Contact form fix', kind: 'extra', mins: 70 }]);
  assert.match(one, /Additionally, the following requested work has also been completed: Contact form fix\./);
  const three = genSummary({ note: '' }, acts(), [AMC, { label: 'A', kind: 'extra', mins: 5 }, { label: 'B', kind: 'extra', mins: 5 }, { label: 'C', kind: 'extra', mins: 5 }]);
  assert.match(three, /completed: A, B, and C\./);
  const two = genSummary({ note: '' }, acts(), [AMC, { label: 'A', kind: 'extra', mins: 5 }, { label: 'B', kind: 'extra', mins: 5 }]);
  assert.match(two, /completed: A and B\./);
});

test('the monthly AMC row is not described as extra work', () => {
  assert.doesNotMatch(genSummary({ note: '' }, acts(), [AMC]), /Additionally/);
});

test('an extra row with no name is left out', () => {
  assert.doesNotMatch(genSummary({ note: '' }, acts(), [AMC, { label: '', kind: 'extra', mins: 5 }]), /Additionally/);
});

test('custom activity names are written in lower case', () => {
  assert.match(genSummary({ note: '' }, [{ name: 'Performance Check', status: 'done' }], [AMC]), /Activities including performance check were carried out/);
});

test('no activities at all still gives a sensible summary', () => {
  const s = genSummary({ note: '' }, [], [AMC]);
  assert.doesNotMatch(s, /Activities including/);
  assert.ok(s.endsWith(LAST));
});
