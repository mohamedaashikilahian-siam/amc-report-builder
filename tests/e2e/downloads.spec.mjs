/* Downloads: the right file name, and a real file. (PR #3 deleted saveBlob and every download broke.) */
import { test, expect, open, pick, setMonth, download, exportBtn, stored } from './support.mjs';
import { backup } from '../fixtures/synthetic.mjs';
import JSZip from 'jszip';

test('Word and PDF buttons trigger a download with the right file name', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  const pdf = await download(page, exportBtn('pdf'));
  expect(pdf.name).toBe('Alpha-AMC-Report-2026-10.pdf');
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const docx = await download(page, exportBtn('docx'));
  expect(docx.name).toBe('Alpha-AMC-Report-2026-10.docx');
  expect(docx.bytes.subarray(0, 2).toString()).toBe('PK');
  await expect(page.locator('#msg')).toContainText('Saved October 2026 and downloaded Alpha-AMC-Report-2026-10.docx');
});

test('with earlier months included the name says "to"', async ({ page }) => {
  await open(page);
  await pick(page, 'Bravo');
  await page.locator('#prev').check();
  expect((await download(page, exportBtn('pdf'))).name).toBe('Bravo-AMC-Report-to-2026-10.pdf');
  expect((await download(page, exportBtn('docx'))).name).toBe('Bravo-AMC-Report-to-2026-10.docx');
});

test('downloading saves the month first', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  expect(Object.keys((await stored(page)).reports)).not.toContain('alpha_2026-10');
  await download(page, exportBtn('pdf'));
  expect((await stored(page)).reports['alpha_2026-10'].work).toEqual([{ label: 'AMC Activities', kind: 'amc', mins: 50 }]);
});

test('a bad time blocks the download with a message', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await page.locator('[data-k="wdur"][data-i="0"]').fill('abc');
  await page.locator(exportBtn('pdf')).click();
  await expect(page.locator('#msg')).toHaveText('One of the times could not be read. Use 50m, 1h 15m or 1:15.');
});

test('Back up downloads valid JSON holding everything', async ({ page }) => {
  await open(page);
  const b = await download(page, '[data-act="backup"]');
  expect(b.name).toMatch(/^amc-backup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(JSON.parse(b.bytes.toString())).toEqual(backup());   // 3 clients, 12 reports, unchanged
});

test.describe('restore', () => {
  test.use({ seed: null });
  test('restoring a backup brings everything back, and backing up again gives the same data', async ({ page }) => {
    await open(page);
    await expect(page.locator('.client:not(.add)')).toHaveCount(0);
    await page.locator('#restorefile').setInputFiles({ name: 'amc-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup())) });
    await expect(page.locator('#topmsg')).toHaveText('Restored 15 records.');
    await expect(page.locator('.client:not(.add)')).toHaveCount(3);
    await pick(page, 'Bravo');
    await expect(page.locator('#carry')).toContainText('Carried forward from September 2026');
    expect(JSON.parse((await download(page, '[data-act="backup"]')).bytes.toString())).toEqual(backup());
  });
  test('a file that is not a backup is refused and changes nothing', async ({ page }) => {
    await open(page);
    await page.locator('#restorefile').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await expect(page.locator('#topmsg')).toContainText('Restore failed: This file is not an AMC backup.');
    await page.locator('#restorefile').setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
    await expect(page.locator('#topmsg')).toContainText('Restore failed');
    expect(await stored(page)).toBeNull();
  });
  test('restore replaces a record with the same id', async ({ page }) => {
    await open(page);
    await page.locator('#restorefile').setInputFiles({ name: 'a.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup())) });
    await expect(page.locator('#topmsg')).toHaveText('Restored 15 records.');
    const changed = backup(); changed.reports['alpha_2026-09'].work[0].mins = 100;
    await page.locator('#restorefile').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
    await expect(page.locator('#topmsg')).toHaveText('Restored 15 records.');
    expect((await stored(page)).reports['alpha_2026-09'].work[0].mins).toBe(100);
    expect(Object.keys((await stored(page)).reports)).toHaveLength(12);       // no duplicates
  });
});

test('BUG-6: a failed restore changes nothing', async ({ page }) => {
  test.fail(true, 'BUG-6, see tests/BUGS.md: records are written one by one with no validation, so a bad file leaves half its records behind');
  await open(page);
  await page.locator('#restorefile').setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ clients: { x: 'junk', y: { label: 'NoDates' } }, reports: { 'x_2026-01': 5 } })) });
  await expect(page.locator('#topmsg')).toContainText('Restore failed');
  expect(await stored(page)).toEqual(backup());
});
