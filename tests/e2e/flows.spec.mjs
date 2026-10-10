/* Expected values come from tests/fixtures/synthetic.mjs (hand-calculated). Alpha: 600 min allocation, Oct 2026 opens with prev 330. */
import { test, expect, open, pick, setMonth, stored, KEY } from './support.mjs';

test.describe('create client and report', () => {
  test.use({ seed: null });

  test('create a client, create a report, save, reload: it persists', async ({ page }) => {
    await open(page);
    await page.locator('[data-act="new-client"]').click();
    await page.locator('#ce_label').fill('Delta');
    await page.locator('#ce_contact').fill('Dana Tester');
    await page.locator('#ce_url').fill('https://delta.example.com/');
    await page.locator('#ce_start').fill('2026-01-01');
    await page.locator('#ce_end').fill('2027-12-31');
    await page.locator('#ce_alloc').fill('10');          // a bare number is hours: 600 min
    await page.locator('#ce_monthly').fill('50m');
    await page.locator('[data-act="save-client"]').click();

    // today is 15 Oct 2026, a new client opens on last month: Sep 2026. prev 600, used 50, consumed 50, remaining 550 = 9 hrs 10 mins
    await expect(page.locator('#month')).toHaveValue('2026-09');
    const calc = page.locator('#calc');
    await expect(calc).toContainText('10 hrs');
    await expect(calc).toContainText('50 mins');
    await expect(calc).toContainText('9 hrs 10 mins');
    await expect(page.locator('#savedpill')).toHaveText('Not saved yet');
    await page.locator('[data-act="save-report"]').click();
    await expect(page.locator('#msg')).toHaveText('Saved September 2026.');

    await page.reload();
    await expect(page.locator('#dbstate')).toHaveText('Saved in this browser only');
    const card = page.locator('.client', { hasText: 'Delta' });
    await expect(card).toContainText('delta.example.com');            // https:// and the trailing slash are stripped
    await expect(card).toContainText('9 hrs 10 mins left');
    await expect(card).toContainText('October 2026 next');
    await card.click();
    await setMonth(page, '2026-09');
    await expect(page.locator('#savedpill')).toHaveText('Saved');
    await expect(page.locator('#summary')).toHaveValue(/maintenance activities scheduled for this reporting period have been completed/);
    const db = await stored(page);
    expect(db.reports['delta_2026-09'].work).toEqual([{ label: 'AMC Activities', kind: 'amc', mins: 50 }]);
  });

  test('a client form with missing or bad values is refused', async ({ page }) => {
    await open(page);
    await page.locator('[data-act="new-client"]').click();
    await page.locator('[data-act="save-client"]').click();
    await expect(page.locator('#ce_msg')).toHaveText('Add a short name, contact name and website.');
    await page.locator('#ce_label').fill('X'); await page.locator('#ce_contact').fill('Y'); await page.locator('#ce_url').fill('x.example.com');
    await page.locator('[data-act="save-client"]').click();
    await expect(page.locator('#ce_msg')).toHaveText('Add the AMC start and end dates.');
    await page.locator('#ce_start').fill('2026-01-01'); await page.locator('#ce_end').fill('2026-12-31');
    await page.locator('#ce_alloc').fill('abc');
    await page.locator('[data-act="save-client"]').click();
    await expect(page.locator('#ce_msg')).toContainText('Enter the AMC hours');
    expect((await stored(page))).toBeNull();
  });

  test('BUG-4: an AMC end date before the start date is refused', async ({ page }) => {
    test.fail(true, 'BUG-4, see tests/BUGS.md: the form accepts an AMC that ends before it starts');
    await open(page);
    await page.locator('[data-act="new-client"]').click();
    await page.locator('#ce_label').fill('Bad'); await page.locator('#ce_contact').fill('Y'); await page.locator('#ce_url').fill('bad.example.com');
    await page.locator('#ce_start').fill('2026-06-01'); await page.locator('#ce_end').fill('2026-01-31');
    await page.locator('#ce_alloc').fill('10');
    await page.locator('[data-act="save-client"]').click();
    await expect(page.locator('#ce_msg')).not.toHaveText('');
    expect(Object.keys((await stored(page))?.clients || {})).toHaveLength(0);
  });
});

test('the hours panel updates while typing', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await expect(page.locator('#month')).toHaveValue('2026-10');
  const used = page.locator('[data-k="wdur"][data-i="0"]');
  await used.fill('');
  await used.pressSequentially('5');
  await expect(page.locator('#calc')).toContainText('5 mins');           // used 5, remaining 330 - 5 = 325 = 5 hrs 25 mins
  await expect(page.locator('#calc')).toContainText('5 hrs 25 mins');
  await used.pressSequentially('0');
  await expect(page.locator('#calc')).toContainText('50 mins');          // used 50, remaining 280 = 4 hrs 40 mins
  await expect(page.locator('#calc')).toContainText('4 hrs 40 mins');
  await used.fill('1h 15m');                                            // used 75, consumed 270 + 75 = 345 = 5 hrs 45 mins, remaining 255 = 4 hrs 15 mins
  await expect(page.locator('#calc')).toContainText('5 hrs 45 mins');
  await expect(page.locator('#calc')).toContainText('4 hrs 15 mins');
  await used.fill('abc');
  await expect(used).toHaveClass(/err/);                                // an unreadable time is flagged
});

test('low-hours warning appears below 20% of the allocation, not at it', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');                                            // 20% of 600 = 120. prev 330, so used 210 leaves exactly 120
  const used = page.locator('[data-k="wdur"][data-i="0"]');
  const flag = page.locator('#calc .flag');
  await used.fill('3h 30m');
  await expect(page.locator('#calc')).toContainText('2 hrs');           // remaining 120
  await expect(flag).toHaveCount(0);
  await used.fill('3h 31m');                                            // remaining 119
  await expect(page.locator('#calc')).toContainText('1 hr 59 mins');
  await expect(flag).toHaveText('⚠ Less than 20% of the AMC hours are left.');
  await used.fill('5h 30m');                                            // remaining 0: still the low-hours warning, not over
  await expect(flag).toHaveText('⚠ Less than 20% of the AMC hours are left.');
});

test('over-allocation warning', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await page.locator('[data-k="wdur"][data-i="0"]').fill('6h');         // used 360, remaining 330 - 360 = -30
  await expect(page.locator('#calc')).toContainText('-30 mins');
  await expect(page.locator('#calc .flag')).toHaveText('⚠ This goes over the AMC allocation by 30 mins.');
});

test('skip a month with a reason: it shows in later history and not in exports', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await page.locator('#skipReason').fill('Server was under migration');
  await page.locator('[data-act="skip-month"]').click();
  await expect(page.locator('#form')).toContainText('October 2026 was skipped: Server was under migration');
  await expect(page.locator('#savedpill')).toHaveText('Skipped');
  await expect(page.locator('#sheets')).toContainText('October 2026 is skipped, so there is no report to preview');
  await expect(page.locator(`[data-act="export"]`)).toHaveCount(0);
  await expect(page.locator('.client', { hasText: 'Alpha' })).toContainText('5 hrs 30 mins left');   // nothing used: 600 - 270 = 330

  await setMonth(page, '2026-11');
  await expect(page.locator('#carry')).toContainText('October 2026 was skipped (Server was under migration)');
  await expect(page.locator('#carry')).toContainText('November 2026 opens with a previous balance of 5 hrs 30 mins');
  const history = page.locator('.sheet').first().locator('h4', { hasText: 'Activity History' }).locator('xpath=following-sibling::table[1]');
  await expect(history).toContainText('October 2026');
  await expect(history).toContainText('Skipped: Server was under migration');
  await expect(history).toContainText('0 mins');
  await expect(page.locator('.sheet')).toHaveCount(1);                  // only November's own report is previewed

  await page.locator('#prev').check();                                  // earlier months: Jun, Jul, Aug, Sep, Nov. October's skip is not a report
  await expect(page.locator('.sheet')).toHaveCount(5);
  await expect(page.locator('#sheets')).not.toContainText('October 2026 is skipped');
});

test('include earlier months shows one sheet per saved month, up to the chosen one', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await expect(page.locator('.sheet')).toHaveCount(1);
  await page.locator('#prev').check();
  await expect(page.locator('.sheet')).toHaveCount(5);                  // Jun, Jul, Aug, Sep + Oct (the form)
  await setMonth(page, '2026-08');                                      // up to August: Jun, Jul, Aug
  await expect(page.locator('.sheet')).toHaveCount(3);
  await page.locator('#prev').uncheck();
  await expect(page.locator('.sheet')).toHaveCount(1);
  await pick(page, 'Bravo');                                            // Jul is skipped, so Bravo has Jun, Aug, Sep, Oct
  await page.locator('#prev').check();
  await expect(page.locator('.sheet')).toHaveCount(4);
});

test.describe('AMC end', () => {
  test('inside the last 3 months: card and banner warn, the final month still works', async ({ page }) => {
    await open(page);                                                   // today 15 Oct 2026. Charlie ends 31 Dec 2026: 16 + 30 + 31 = 77 days
    await expect(page.locator('.client', { hasText: 'Charlie' })).toContainText('AMC ends 31 Dec 2026 (77 days)');
    await expect(page.locator('.client', { hasText: 'Bravo' })).not.toContainText('AMC ends');
    await pick(page, 'Charlie');
    await expect(page.locator('.amcbox.warn')).toContainText('AMC ends on 31 Dec 2026 (77 days left)');
    await setMonth(page, '2026-12');                                    // the AMC's last month
    await expect(page.locator('[data-act="save-report"]')).toBeEnabled();
    await expect(page.locator('[data-act="skip-month"]')).toBeEnabled();
    await expect(page.locator(exportSel('pdf'))).toBeEnabled();
    await expect(page.locator(exportSel('docx'))).toBeEnabled();
  });

  test('a month after the AMC end: Save, Word, PDF and Skip are all disabled', async ({ page }) => {
    await open(page);
    await pick(page, 'Charlie');
    await setMonth(page, '2027-01');
    await expect(page.locator('.amcbox.bad')).toContainText('January 2027 is after the AMC period ended (31 Dec 2026)');
    for (const sel of ['[data-act="save-report"]', exportSel('docx'), exportSel('pdf'), '[data-act="skip-month"]']) await expect(page.locator(sel), sel).toBeDisabled();
    expect(Object.keys((await stored(page)).reports)).not.toContain('charlie_2027-01');
  });

  test.describe('after the end date', () => {
    test.use({ today: new Date(2027, 0, 15, 10, 0, 0) });
    test('the card and banner say the AMC has ended', async ({ page }) => {
      await open(page);
      await expect(page.locator('.client', { hasText: 'Charlie' })).toContainText('AMC ended 31 Dec 2026');
      await pick(page, 'Charlie');
      await expect(page.locator('#month')).toHaveValue('2026-10');      // last saved is Sep, so Oct is next and still allowed
      await expect(page.locator('.amcbox.bad')).toContainText('This AMC ended on 31 Dec 2026');
      await expect(page.locator('[data-act="save-report"]')).toBeEnabled();
      await setMonth(page, '2027-01');
      await expect(page.locator('[data-act="save-report"]')).toBeDisabled();
    });
  });
});
const exportSel = kind => '[data-act="export"][data-kind="' + kind + '"]';

test('next month after December is January of the next year; a gap of two months is flagged', async ({ page, seed }) => {
  // Alpha has a December 2026 report on top of Jun-Sep, so the next month is Jan 2027
  seed.reports['alpha_2026-12'] = { ...seed.reports['alpha_2026-09'], month: '2026-12' };
  await page.addInitScript(({ k, d }) => localStorage.setItem(k, d), { k: KEY, d: JSON.stringify(seed) });
  await open(page);
  await pick(page, 'Alpha');
  await expect(page.locator('#month')).toHaveValue('2027-01');
  await expect(page.locator('#carry')).toContainText('Carried forward from December 2026');
  await expect(page.locator('#carry .flag')).toHaveCount(0);
  await pick(page, 'Bravo');
  await setMonth(page, '2026-12');                                      // Bravo's last report is Sep: Oct and Nov are missing
  await expect(page.locator('#carry .flag')).toContainText('2 months between September 2026 and December 2026 have no saved report');
  await expect(page.locator('#carry')).toContainText('December 2026 opens with a previous balance of 5 hrs 30 mins'); // 330
});

test('delete needs a second click, for a report and for a client', async ({ page }) => {
  await open(page);
  await pick(page, 'Alpha');
  await setMonth(page, '2026-09');
  const del = page.locator('#delrep');
  await expect(del).toHaveText('Delete saved report');
  await del.click();
  await expect(del).toHaveText('Click again to delete');
  expect(Object.keys((await stored(page)).reports)).toContain('alpha_2026-09');   // one click deleted nothing
  await del.click();
  await expect(page.locator('#savedpill')).toHaveText('Not saved yet');
  expect(Object.keys((await stored(page)).reports)).not.toContain('alpha_2026-09');
  expect(Object.keys((await stored(page)).reports)).toContain('alpha_2026-08');   // and nothing else went

  await pick(page, 'Charlie');
  await page.locator('[data-act="edit-client"]').click();
  const delClient = page.locator('[data-act="del-client"]');
  await delClient.click();
  await expect(delClient).toHaveText('Click again to delete client and its reports');
  expect(Object.keys((await stored(page)).clients)).toContain('charlie');
  await delClient.click();
  await expect(page.locator('.client', { hasText: 'Charlie' })).toHaveCount(0);
  const db = await stored(page);
  expect(Object.keys(db.clients).sort()).toEqual(['alpha', 'bravo']);
  expect(Object.keys(db.reports).filter(k => k.startsWith('charlie'))).toEqual([]);   // its reports went with it
  expect(Object.keys(db.reports).filter(k => k.startsWith('bravo'))).toHaveLength(4); // others untouched
});

test('a saved report is not changed by merely opening it', async ({ page }) => {
  await open(page);
  const before = JSON.stringify((await stored(page)).reports);
  await pick(page, 'Alpha'); await setMonth(page, '2026-08'); await pick(page, 'Bravo'); await setMonth(page, '2026-07');
  expect(JSON.stringify((await stored(page)).reports)).toBe(before);
});
