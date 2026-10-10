/* End-to-end tests. The server (serve.mjs) forces localStorage mode, so production Firestore is never touched.
   Data: tests/fixtures/synthetic-backup.json. Every expected value below is hand-calculated, not copied from app output.

   TestA: 8 hrs (480 min) allocation, 50 min a month, reports saved for Jun and Jul 2026, AMC ends 2099.
     Aug 2026 previous balance = 480 - 50 - 50 = 380 min = 6 hrs 20 mins
   TestB: AMC ended 31 Jan 2020, reports saved for Dec 2019 and Jan 2020. Next month (Feb 2020) is after the AMC. */
import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const FIXTURE = fileURLToPath(new URL('../fixtures/synthetic-backup.json', import.meta.url));

async function openWithFixture(page) {
  const prodCalls = [];
  page.on('request', r => { if (/firestore\.googleapis|firebaseio|identitytoolkit|gstatic\.com\/firebasejs/.test(r.url())) prodCalls.push(r.url()); });
  await page.goto('/');
  await expect(page.locator('#dbstate')).toHaveText('Saved in this browser only');
  await page.locator('#restorefile').setInputFiles(FIXTURE);
  await expect(page.locator('#topmsg')).toHaveText('Restored 6 records.');
  return prodCalls;
}
const pick = (page, label) => page.locator('.client', { hasText: label }).first().click();

test('runs on browser storage and never calls Firebase', async ({ page }) => {
  const prodCalls = await openWithFixture(page);
  await pick(page, 'TestA');
  expect(prodCalls).toEqual([]);
});

test('next report opens on the next unsaved month with the right carried-forward figures', async ({ page }) => {
  await openWithFixture(page);
  await pick(page, 'TestA');
  await expect(page.locator('#month')).toHaveValue('2026-08');
  // July's figures: prev 480-50 = 430 (7 hrs 10 mins), used 50, consumed 100 (1 hr 40 mins), remaining 380 (6 hrs 20 mins)
  const carry = page.locator('#carry');
  await expect(carry).toContainText('Carried forward from July 2026');
  await expect(carry).toContainText('7 hrs 10 mins');
  await expect(carry).toContainText('1 hr 40 mins');
  await expect(carry).toContainText('August 2026 opens with a previous balance of 6 hrs 20 mins');
  // Aug live figures: prev 380, used 50 (prefilled), consumed 150 (2 hrs 30 mins), remaining 330 (5 hrs 30 mins)
  const calc = page.locator('#calc');
  await expect(calc).toContainText('6 hrs 20 mins');
  await expect(calc).toContainText('50 mins');
  await expect(calc).toContainText('2 hrs 30 mins');
  await expect(calc).toContainText('5 hrs 30 mins');
});

test('an extra work item changes used, consumed and remaining', async ({ page }) => {
  await openWithFixture(page);
  await pick(page, 'TestA');
  await page.locator('[data-act="add-work"]').click();
  await page.locator('[data-k="wlabel"][data-i="1"]').fill('Contact form fix');
  await page.locator('[data-k="wdur"][data-i="1"]').fill('1h 10m');
  // used = 50 + 70 = 120 (2 hrs); consumed = 100 + 120 = 220 (3 hrs 40 mins); remaining = 480 - 220 = 260 (4 hrs 20 mins)
  const calc = page.locator('#calc');
  await expect(calc).toContainText('2 hrs');
  await expect(calc).toContainText('3 hrs 40 mins');
  await expect(calc).toContainText('4 hrs 20 mins');
});

test('Word and PDF download, and are real files with the Siam letterhead', async ({ page }) => {
  await openWithFixture(page);
  await pick(page, 'TestA');

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="export"][data-kind="pdf"]').click()]);
  expect(pdf.suggestedFilename()).toBe('TestA-AMC-Report-2026-08.pdf');
  const pdfBytes = await readFile(await pdf.path());
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect((pdfBytes.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length).toBe(2); // one month = 2 pages

  const [docx] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="export"][data-kind="docx"]').click()]);
  expect(docx.suggestedFilename()).toBe('TestA-AMC-Report-2026-08.docx');
  const zip = await JSZip.loadAsync(await readFile(await docx.path()));
  for (const f of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml', 'word/media/siam-logo.png', 'word/media/siam-watermark.png']) expect(zip.file(f), f).toBeTruthy();
  expect(await zip.file('word/document.xml').async('string')).toContain('Alex Tester');

  await expect(page.locator('#msg')).toContainText('Saved August 2026 and downloaded');
});

test('Back up downloads a JSON file', async ({ page }) => {
  await openWithFixture(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="backup"]').click()]);
  expect(dl.suggestedFilename()).toMatch(/^amc-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(Object.keys(data.clients).sort()).toEqual(['test-a', 'test-b']);
  expect(Object.keys(data.reports)).toHaveLength(4);
});

test('a month after the AMC end is blocked, the final month is not', async ({ page }) => {
  await openWithFixture(page);
  await pick(page, 'TestB');
  await expect(page.locator('.client', { hasText: 'TestB' })).toContainText('AMC ended 31 Jan 2020');
  await expect(page.locator('#month')).toHaveValue('2020-02');
  await expect(page.locator('.amcbox')).toContainText('This AMC ended on 31 Jan 2020');
  for (const sel of ['[data-act="save-report"]', '[data-act="export"][data-kind="pdf"]', '[data-act="export"][data-kind="docx"]']) await expect(page.locator(sel)).toBeDisabled();
  // January 2020 is the AMC's last month: still allowed
  await page.locator('#month').fill('2020-01');
  await expect(page.locator('[data-act="save-report"]')).toBeEnabled();
});

test('skipping a month uses no hours and carries the balance forward', async ({ page }) => {
  await openWithFixture(page);
  await pick(page, 'TestA');
  await page.locator('#skipReason').fill('Client could not share the OTP');
  await page.locator('[data-act="skip-month"]').click();
  await expect(page.locator('#form')).toContainText('August 2026 was skipped');
  await expect(page.locator('#savedpill')).toHaveText('Skipped');
  await expect(page.locator('[data-act="export"]')).toHaveCount(0);
  // Sep: nothing used in Aug, so previous balance is still 480 - 100 = 380 (6 hrs 20 mins)
  await page.locator('#month').fill('2026-09');
  await expect(page.locator('#carry')).toContainText('August 2026 was skipped');
  await expect(page.locator('#carry')).toContainText('September 2026 opens with a previous balance of 6 hrs 20 mins');
  await expect(page.locator('.client', { hasText: 'TestA' })).toContainText('6 hrs 20 mins left');
});
