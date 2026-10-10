/* The downloaded files are opened and read: the numbers in them must equal the numbers on screen and the hand-calculated ones.
   Alpha, Oct 2026 (50 min used): prev 600-270 = 330 (5 hrs 30 mins), used 50, consumed 320 (5 hrs 20 mins), remaining 280 (4 hrs 40 mins). */
import { test, expect, open, pick, setMonth, download, exportBtn } from './support.mjs';
import { pdfPages, parseXml, wordRows, wordText } from '../export/helpers.mjs';
import JSZip from 'jszip';

const HAND = { 'Previous Balance': '5 hrs 30 mins', 'Hours Used This Month': '50 mins', 'Total Hours Consumed': '5 hrs 20 mins', 'Remaining AMC Hours': '4 hrs 40 mins' };
const onScreen = async page => {
  const rows = await page.locator('.sheet').last().locator('h4', { hasText: 'AMC Hours Utilization' }).locator('xpath=following-sibling::table[1]//tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(c => c.textContent.trim())));
  return Object.fromEntries(rows.filter(r => r[0] !== 'Item'));
};

test('PDF: the numbers match the screen and the hand calculation', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  const screen = await onScreen(page);
  expect(screen).toEqual(HAND);
  const { bytes } = await download(page, exportBtn('pdf'));
  const [p1, p2] = await pdfPages(bytes);
  // on page 1 the labels and values appear in order, exactly as on screen
  const seq = Object.entries(screen).map(([k, v]) => k + ' ' + v).join(' ');
  expect(p1).toContain(seq);
  for (const t of ['Client Name: Alice Tester', 'Website URL: alpha.example.com', 'Reporting Period: October 2026', 'AMC Period: 1 Jan 2026 - 30 Jun 2027']) expect(p1).toContain(t);
  expect(p1).toContain('Domain Expiry Check');
  expect(p1).toContain('Expiry: Dec 20, 2026');
  // page 2: history and summary
  const summary = await page.locator('#summary').inputValue();
  expect(p2).toContain('Activity History');
  for (const row of ['June 2026 AMC Activities 50 mins', 'August 2026 AMC Activities 50 mins', 'August 2026 Contact form fix 1 hr 10 mins', 'October 2026 AMC Activities 50 mins']) expect(p2).toContain(row);
  expect(p2.replace(/\s/g, '')).toContain(summary.replace(/\s/g, ''));
});

test('Word: the numbers match the screen and the hand calculation', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  const screen = await onScreen(page);
  const { bytes } = await download(page, exportBtn('docx'));
  const zip = await JSZip.loadAsync(bytes);
  for (const n of Object.keys(zip.files).filter(n => /\.(xml|rels)$/.test(n))) parseXml(await zip.file(n).async('string'), n);
  const doc = parseXml(await zip.file('word/document.xml').async('string'));
  const rows = wordRows(doc);
  for (const [k, v] of Object.entries(screen)) expect(rows.find(r => r[0] === k)?.[1], k).toBe(v);
  expect(wordText(doc)).toContain('Reporting Period: October 2026');
  expect(wordText(doc)).toContain(await page.locator('#summary').inputValue());
});

test('a skipped month is not a report in the Word or PDF with earlier months', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await page.locator('#skipReason').fill('No access');
  await page.locator('[data-act="skip-month"]').click();
  await setMonth(page, '2026-11');
  await page.locator('#prev').check();
  const docx = await JSZip.loadAsync((await download(page, exportBtn('docx'))).bytes);
  const doc = parseXml(await docx.file('word/document.xml').async('string'));
  expect(wordText(doc).filter(t => t.startsWith('Reporting Period')).map(t => t.slice(18))).toEqual(['June 2026', 'July 2026', 'August 2026', 'September 2026', 'November 2026']);
  expect(wordRows(doc).some(r => r[0] === 'October 2026' && r[1] === 'Skipped: No access' && r[2] === '0 mins')).toBe(true);
  const pages = await pdfPages((await download(page, exportBtn('pdf'))).bytes);
  expect(pages).toHaveLength(10);                                       // 5 reports x 2 pages: October is not one of them
  expect(pages.filter((_, i) => i % 2 === 0).map(p => p.match(/Reporting Period: (\w+ \d{4})/)[1])).toEqual(['June 2026', 'July 2026', 'August 2026', 'September 2026', 'November 2026']);
});

test('a client with N/A activities and a note: the summary and ticks come through', async ({ page, seed }) => {
  seed.clients.alpha.note = 'Domain renewals are handled by the client\'s host.';
  await page.addInitScript(({ k, d }) => localStorage.setItem(k, d), { k: 'amc-report-builder-v1', d: JSON.stringify(seed) });
  await open(page);
  await pick(page, 'Alpha');
  await page.locator('[data-act="status"][data-s="na"]').nth(2).click();     // Domain Expiry Check -> N/A
  await expect(page.locator('#summary')).toHaveValue(/Domain renewals are handled by the client's host\./);
  const doc = parseXml(await (await JSZip.loadAsync((await download(page, exportBtn('docx'))).bytes)).file('word/document.xml').async('string'));
  expect(wordRows(doc).find(r => r[0] === 'Domain Expiry Check').slice(1, 3)).toEqual(['☐', '☐']);   // N/A: neither box ticked
  expect(wordText(doc).join(' ')).toContain("Domain renewals are handled by the client's host.");
});
