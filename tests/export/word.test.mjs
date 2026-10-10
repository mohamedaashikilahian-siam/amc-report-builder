/* Word output. LibreOffice is not installed here, so page counts are checked from the document structure
   (one forced page break before page 2 of each month, and one between months), not from a rendered file. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { makeModel } from '../../public/js/core.js';
import { clients, list } from '../fixtures/synthetic.mjs';
import { buildDocx, parseXml, wordRows, wordText } from './helpers.mjs';

const months = ['2026-06', '2026-07', '2026-08', '2026-09'];
const build = async (client, ym) => { const l = list(client); const buf = await buildDocx(clients[client], ym.map(m => makeModel(clients[client], l, m))); return { buf, zip: await JSZip.loadAsync(buf) }; };
const xmlOf = async (zip, name) => parseXml(await zip.file(name).async('string'), name);

test('every XML part is well-formed', async () => {
  const { zip } = await build('alpha', months);
  const parts = Object.keys(zip.files).filter(n => /\.(xml|rels)$/.test(n));
  assert.ok(parts.length >= 8, parts.join(', '));
  for (const n of parts) parseXml(await zip.file(n).async('string'), n);
});

test('the package has everything the relationships point to', async () => {
  const { zip } = await build('alpha', ['2026-09']);
  const rels = await xmlOf(zip, 'word/_rels/document.xml.rels');
  for (const r of Array.from(rels.getElementsByTagName('Relationship'))) assert.ok(zip.file('word/' + r.getAttribute('Target')), 'word/' + r.getAttribute('Target'));
  const hrels = await xmlOf(zip, 'word/_rels/header1.xml.rels');
  for (const r of Array.from(hrels.getElementsByTagName('Relationship'))) if (r.getAttribute('TargetMode') !== 'External') assert.ok(zip.file('word/' + r.getAttribute('Target')), r.getAttribute('Target'));
  const types = await zip.file('[Content_Types].xml').async('string');
  for (const part of ['/word/document.xml', '/word/styles.xml', '/word/header1.xml', '/word/footer1.xml']) assert.ok(types.includes(part), part);
});

test('the report values match the hand-calculated figures (Alpha, Sep 2026: prev 380, used 50, consumed 270, remaining 330)', async () => {
  const { zip } = await build('alpha', ['2026-09']);
  const rows = wordRows(await xmlOf(zip, 'word/document.xml'));
  const val = label => (rows.find(r => r[0] === label) || [])[1];
  assert.equal(val('Previous Balance'), '6 hrs 20 mins');
  assert.equal(val('Hours Used This Month'), '50 mins');
  assert.equal(val('Total Hours Consumed'), '4 hrs 30 mins');
  assert.equal(val('Remaining AMC Hours'), '5 hrs 30 mins');
  assert.equal(val('Client Name'), undefined); // client info is "Label: value" paragraphs, checked below
  const text = wordText(await xmlOf(zip, 'word/document.xml'));
  for (const t of ['Client Name: Alice Tester', 'Website URL: alpha.example.com', 'Reporting Period: September 2026', 'AMC Period: 1 Jan 2026 - 30 Jun 2027']) assert.ok(text.includes(t), t);
});

test('activities: a ticked Done and an empty Not Done per row, with the remark', async () => {
  const { zip } = await build('alpha', ['2026-09']);
  const rows = wordRows(await xmlOf(zip, 'word/document.xml'));
  assert.deepEqual(rows.find(r => r[0] === 'Domain Expiry Check'), ['Domain Expiry Check', '✔', '☐', 'Expiry: Dec 20, 2026']);
  assert.deepEqual(rows.find(r => r[0] === 'Website Backup'), ['Website Backup', '✔', '☐', '']);
});

test('history lists every month up to the report month, extra work on its own row', async () => {
  const { zip } = await build('alpha', ['2026-09']);
  const rows = wordRows(await xmlOf(zip, 'word/document.xml')).filter(r => r.length === 3 && /^\w+ 2026$/.test(r[0]));
  assert.deepEqual(rows, [['June 2026', 'AMC Activities', '50 mins'], ['July 2026', 'AMC Activities', '50 mins'], ['August 2026', 'AMC Activities', '50 mins'], ['August 2026', 'Contact form fix', '1 hr 10 mins'], ['September 2026', 'AMC Activities', '50 mins']]);
});

test('a skipped month appears in history and has no report of its own', async () => {
  const l = list('bravo'), c = clients.bravo;
  const buf = await buildDocx(c, ['2026-08', '2026-09'].map(m => makeModel(c, l, m)));
  const doc = parseXml(await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string'));
  assert.ok(wordRows(doc).some(r => r[0] === 'July 2026' && r[1] === 'Skipped: Client could not share the OTP' && r[2] === '0 mins'));
  assert.deepEqual(wordText(doc).filter(t => t.startsWith('Reporting Period')), ['Reporting Period: August 2026', 'Reporting Period: September 2026']);
});

test('2 pages per month: one page break before page 2 of each month and one between months', async () => {
  for (const n of [1, 2, 4]) {
    const { zip } = await build('alpha', months.slice(0, n));
    const xml = await zip.file('word/document.xml').async('string');
    assert.equal((xml.match(/<w:pageBreakBefore\/>/g) || []).length, n, n + ' months: break before page 2');
    assert.equal((xml.match(/<w:br w:type="page"\/>/g) || []).length, n - 1, n + ' months: break between months');
    assert.equal((xml.match(/>Client Information</g) || []).length, n);
  }
});

test('the header carries the letterhead and the footer shows a page number only past page 1', async () => {
  const { zip } = await build('alpha', ['2026-09']);
  const header = await zip.file('word/header1.xml').async('string');
  assert.ok(wordText(parseXml(header)).join(' ').includes("We don't sell code, we deliver clarity."));
  assert.ok(header.includes('behindDoc="1"') && header.includes('r:embed="rId1"') && header.includes('r:embed="rId2"'));
  const footer = await zip.file('word/footer1.xml').async('string');
  assert.ok(footer.includes('> IF <'), 'page number is wrapped in an IF field');
  assert.ok(footer.includes('NUMPAGES') && footer.includes(' PAGE '));
  assert.ok((await zip.file('word/_rels/header1.xml.rels').async('string')).includes('Target="https://siamcomputing.com"'), 'the website line is a link');
});

test('a macOS text converter can open the file and finds the same values', { skip: process.platform !== 'darwin' && 'textutil is macOS only' }, async () => {
  const { buf } = await build('alpha', ['2026-09']);
  const dir = mkdtempSync(join(tmpdir(), 'amc-'));
  writeFileSync(join(dir, 'r.docx'), buf);
  execFileSync('textutil', ['-convert', 'txt', join(dir, 'r.docx')]);
  const txt = readFileSync(join(dir, 'r.txt'), 'utf8');
  for (const t of ['Client Name: Alice Tester', 'Reporting Period: September 2026', 'Previous Balance', '6 hrs 20 mins', '5 hrs 30 mins', 'Contact form fix', 'Summary']) assert.ok(txt.includes(t), t);
});
