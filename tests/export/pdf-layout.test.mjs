/* Each month should take exactly 2 pages: page 1 = Client Information, Maintenance Activities, AMC Hours Utilization;
   page 2 = Activity History, Summary. These tests check where the sections actually land. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeModel } from '../../public/js/core.js';
import { clients, list } from '../fixtures/synthetic.mjs';
import { pdfPages, buildPdf, bigReport } from './helpers.mjs';

const pagesFor = async opts => { const r = bigReport(opts); return pdfPages(buildPdf(r.client, r.models)); };

test('a normal report is exactly 2 pages with the sections where the template puts them', async () => {
  const pages = await pagesFor();
  assert.equal(pages.length, 2);
  for (const h of ['Client Information', 'Maintenance Activities', 'AMC Hours Utilization']) assert.ok(pages[0].includes(h), h + ' on page 1');
  for (const h of ['Activity History', 'Summary']) assert.ok(pages[1].includes(h), h + ' on page 2');
  assert.ok(!pages[0].includes('Activity History') && !pages[0].includes('Summary'));
  assert.ok(!pages[1].includes('Client Information'));
});

test('the PDF carries the logo and the watermark on every page', async () => {
  const r = bigReport();
  const raw = buildPdf(r.client, r.models).toString('latin1');
  assert.equal((raw.match(/\/Subtype\s*\/Image/g) || []).length >= 2, true, 'logo and watermark are embedded');
  assert.equal((raw.match(/\/Type\s*\/Page\b(?!s)/g) || []).length, 2);
  assert.ok((raw.match(/siamcomputing\.com/g) || []).length >= 2, 'website link on both pages');
});

test('pages are numbered 1 and 2 at the bottom', async () => {
  const two = await pagesFor();
  assert.ok(two[0].endsWith(' 1') && two[1].endsWith(' 2'));
});

test('every month of a multi-month PDF is 2 pages, in order', async () => {
  const c = clients.alpha, l = list('alpha');
  const models = ['2026-06', '2026-07', '2026-08', '2026-09'].map(m => makeModel(c, l, m));
  const pages = await pdfPages(buildPdf(c, models));
  assert.equal(pages.length, 8);
  const periods = pages.filter((_, i) => i % 2 === 0).map(p => p.match(/Reporting Period: (\w+ \d{4})/)[1]);
  assert.deepEqual(periods, ['June 2026', 'July 2026', 'August 2026', 'September 2026']);
  pages.forEach((p, i) => assert.ok(p.endsWith(' ' + (i + 1)), 'page number ' + (i + 1)));
});

test('a full year of history and a 12-activity report still fit in 2 pages', async () => {
  const pages = await pagesFor({ activities: 12, remarkLen: 30, months: 12, summaryLen: 600 });
  assert.equal(pages.length, 2);
});

/* Where the layout breaks. The limits are measured and listed in tests/BUGS.md (BUG-5). */
test('BUG-5: many activities with long remarks stay on page 1', { todo: 'see tests/BUGS.md BUG-5' }, async () => {
  const pages = await pagesFor({ activities: 15, remarkLen: 90 });
  assert.equal(pages.length, 2);
  assert.ok(pages[0].includes('AMC Hours Utilization'), 'AMC Hours Utilization is still on page 1');
});
test('BUG-5: a long history stays on page 2 with the summary', { todo: 'see tests/BUGS.md BUG-5' }, async () => {
  const pages = await pagesFor({ months: 24, summaryLen: 600 });
  assert.equal(pages.length, 2);
});
test('a long summary (1,500 characters) still fits on page 2', async () => {
  const pages = await pagesFor({ months: 12, summaryLen: 1500 });
  assert.equal(pages.length, 2);
});

test('measure: how far the layout stretches before page 1 or 2 overflows (printed, not asserted)', async () => {
  const limits = {};
  for (const remarkLen of [0, 90]) { let n = 7; while (n < 40 && (await pagesFor({ activities: n + 1, remarkLen })).length === 2) n++; limits['activities (remark ' + remarkLen + ' chars)'] = n; }
  let m = 4; while (m < 60 && (await pagesFor({ months: m + 1, summaryLen: 400 })).length === 2) m++; limits['history months (400 char summary)'] = m;
  let s = 160; while (s < 4000 && (await pagesFor({ months: 4, summaryLen: s + 80 })).length === 2) s += 80; limits['summary characters (4 months history)'] = s;
  console.log('LAYOUT LIMITS before the report needs a 3rd page:', JSON.stringify(limits));
});
