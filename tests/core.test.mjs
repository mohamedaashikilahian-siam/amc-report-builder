import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseDur, fmtDur, hoursFor, carryForward, amcState, monthAfterAmc, genSummary, makeModel, addMonth, buildDocxZip, buildPdfDoc } from '../public/js/core.js';

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

test('the next report starts from what the last saved report left behind', () => {
  const c = { allocMins: 480 };
  const l = [rep('2026-06', [AMC(50)]), rep('2026-07', [AMC(50)])];
  const k = carryForward(c, l, '2026-08');
  assert.equal(k.last, '2026-07');
  assert.deepEqual(k.figures, { prev: 430, used: 50, consumed: 100, remaining: 380 });
  assert.equal(k.start, 380);
  assert.equal(k.gap, 0);
  assert.equal(carryForward(c, l, '2026-10').gap, 2); // Aug and Sep were never saved
  assert.deepEqual(carryForward(c, [], '2026-08'), { last: null, start: 480, gap: 0 });
});

test('Word and PDF carry the Siam letterhead and watermark', async () => {
  globalThis.JSZip = JSZip;
  const assets = { logo: readFileSync('public/img/siam-logo.png'), watermark: readFileSync('public/img/siam-watermark.png') };
  const client = { contact: 'A', url: 'example.com', amcStart: '2026-05-08', amcEnd: '2027-05-08', allocMins: 480, note: '' };
  const list = [rep('2026-07', [AMC(50)])];
  const models = [makeModel(client, list, '2026-07')];
  const zip = await JSZip.loadAsync(await buildDocxZip(client, models, assets).generateAsync({ type: 'uint8array' }));
  assert.ok(zip.file('word/media/siam-logo.png') && zip.file('word/media/siam-watermark.png'));
  const hdr = await zip.file('word/header1.xml').async('string');
  assert.match(hdr, /behindDoc="1"/);
  assert.match(hdr, /We don't sell code, we deliver clarity\./);
  assert.match(await zip.file('word/_rels/header1.xml.rels').async('string'), /siam-watermark\.png/);
  const pdf = buildPdfDoc(client, models, jsPDF, autoTable, assets);
  assert.ok(pdf.output('arraybuffer').byteLength > assets.logo.length);
});

test('AMC end date blocks later months and warns in the last 3 months', () => {
  const c = { amcEnd: '2026-11-08' };
  assert.deepEqual(amcState(c, new Date(2026, 7, 8)), { ended: false, days: 92, warn: true });   // 8 Aug: exactly 3 months out
  assert.equal(amcState(c, new Date(2026, 7, 7)).warn, false);
  assert.equal(amcState(c, new Date(2026, 10, 8)).ended, false);                                  // last day still valid
  assert.equal(amcState(c, new Date(2026, 10, 9)).ended, true);
  assert.equal(monthAfterAmc(c, '2026-11'), false);                                               // the final month can be reported
  assert.equal(monthAfterAmc(c, '2026-12'), true);
});

test('a skipped month uses no hours, shows in history and keeps the balance moving', () => {
  const c = { allocMins: 480 };
  const skip = { month: '2026-08', skipped: true, skipReason: 'Client could not share the OTP', acts: [], work: [], summary: '' };
  const l = [rep('2026-07', [AMC(50)]), skip, rep('2026-09', [AMC(50)])];
  assert.deepEqual(hoursFor(c, l, '2026-09'), { prev: 430, used: 50, consumed: 100, remaining: 380 });
  const k = carryForward(c, l.slice(0, 2), '2026-09');
  assert.equal(k.skipped, true);
  assert.equal(k.gap, 0);
  assert.deepEqual(makeModel({ ...c, contact: 'A', url: 'x.com', amcStart: '2026-05-08', amcEnd: '2027-05-08' }, l, '2026-09').history[1], ['August 2026', 'Skipped: Client could not share the OTP', '0 mins']);
});
