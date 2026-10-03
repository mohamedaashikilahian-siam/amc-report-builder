import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseDur, fmtDur, hoursFor, genSummary, makeModel, addMonth, buildDocxZip, buildPdfDoc } from '../public/js/core.js';

const AMC = m => ({ label: 'AMC Activities', kind: 'amc', mins: m });
const rep = (month, work) => ({ month, work, acts: [{ name: 'Website Backup', status: 'done', remark: '' }], summary: 'x' });

test('time input is understood', () => {
  assert.equal(parseDur('50'), 50);
  assert.equal(parseDur('1h 15m'), 75);
  assert.equal(parseDur('1hr 15mins'), 75);
  assert.equal(parseDur('1:15'), 75);
  assert.equal(parseDur('3 hrs 20 mins'), 200);
  assert.equal(parseDur('8', 'h'), 480);
  assert.ok(Number.isNaN(parseDur('abc')));
});

test('time is written the way the reports write it', () => {
  assert.equal(fmtDur(50), '50 mins');
  assert.equal(fmtDur(75), '1 hr 15 mins');
  assert.equal(fmtDur(480), '8 hrs');
  assert.equal(fmtDur(430), '7 hrs 10 mins');
});

test('balances match the figures in the existing reports', () => {
  // Tejasvita: 14 hrs, July had 1h15 monthly + 3h20 fix
  const tej = { allocMins: 840 };
  const tl = [rep('2026-06', [AMC(75)]), rep('2026-07', [AMC(75), { label: 'Fix', kind: 'extra', mins: 200 }])];
  assert.deepEqual(hoursFor(tej, tl, '2026-07'), { prev: 765, used: 275, consumed: 350, remaining: 490 }); // 12h45, 4h35, 5h50, 8h10
  // ABDF August: 8 hrs, 50 mins a month
  const abdf = { allocMins: 480 };
  const al = ['2026-06', '2026-07', '2026-08'].map(m => rep(m, [AMC(50)]));
  const h = hoursFor(abdf, al, '2026-08');
  assert.equal(fmtDur(h.prev), '6 hrs 20 mins');
  assert.equal(fmtDur(h.consumed), '2 hrs 30 mins');
  assert.equal(fmtDur(h.remaining), '5 hrs 30 mins');
  // Juzer August: 15 hrs, 1h15 a month
  const juz = { allocMins: 900 };
  const jl = ['2026-06', '2026-07', '2026-08'].map(m => rep(m, [AMC(75)]));
  assert.equal(fmtDur(hoursFor(juz, jl, '2026-08').remaining), '11 hrs 15 mins');
});

test('a month that is not saved yet does not change the balance', () => {
  const c = { allocMins: 480 };
  const l = [rep('2026-06', [AMC(50)])];
  assert.equal(hoursFor(c, l, '2026-08').prev, 430);
});

test('month arithmetic crosses the year end', () => {
  assert.equal(addMonth('2026-12', 1), '2027-01');
  assert.equal(addMonth('2026-01', -1), '2025-12');
});

test('summary text covers extra work and N/A activities', () => {
  const c = { note: 'Renewals are handled by the hosting provider.' };
  const acts = [{ name: 'Website Backup', status: 'done' }, { name: 'Domain Expiry Check', status: 'na' }];
  const s = genSummary(c, acts, [AMC(50), { label: 'Contact form fix', kind: 'extra', mins: 30 }]);
  assert.match(s, /website backup/);
  assert.match(s, /Renewals are handled by the hosting provider\./);
  assert.match(s, /Contact form fix/);
});

test('Word and PDF files can be built', async () => {
  globalThis.JSZip = JSZip;
  const client = { contact: 'A', url: 'example.com', amcStart: '2026-05-08', amcEnd: '2027-05-08', allocMins: 480, note: '' };
  const list = [rep('2026-06', [AMC(50)]), rep('2026-07', [AMC(50)])];
  const models = ['2026-06', '2026-07'].map(m => makeModel(client, list, m));
  const zip = await buildDocxZip(client, models).generateAsync({ type: 'uint8array' });
  assert.ok(zip.length > 1000);
  const pdf = buildPdfDoc(client, models, jsPDF, autoTable);
  assert.equal(pdf.getNumberOfPages(), 2);
});
