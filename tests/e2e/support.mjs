/* Shared test setup. Every test gets:
   - /js/firebase-config.js replaced with a null config (page.route), so the app uses localStorage;
   - every request to Firebase/Google blocked and recorded: the test fails if the app tries any;
   - a fixed clock (15 Oct 2026 by default);
   - localStorage seeded from `seed` (a backup object) on the first load only, so reloads keep what the app saved. */
import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { backup } from '../fixtures/synthetic.mjs';

export const KEY = 'amc-report-builder-v1';
export const test = base.extend({
  seed: [backup(), { option: true }],
  today: [new Date(2026, 9, 15, 10, 0, 0), { option: true }],
  page: async ({ page, seed, today }, use) => {
    const blocked = [];
    await page.route('**/js/firebase-config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'export const firebaseConfig = null;\n' }));
    await page.route(/firestore\.googleapis|firebaseio|identitytoolkit|securetoken|gstatic\.com\/firebasejs/, r => { blocked.push(r.request().url()); return r.abort(); });
    await page.clock.setFixedTime(today);
    if (seed) await page.addInitScript(({ k, d }) => { if (!localStorage.getItem(k)) localStorage.setItem(k, d); }, { k: KEY, d: JSON.stringify(seed) });
    await use(page);
    expect(blocked, 'the app must never call Firebase in tests').toEqual([]);
  }
});
export { expect };

export const open = async page => { await page.goto('/'); await expect(page.locator('#dbstate')).toHaveText('Saved in this browser only'); };
export const pick = (page, label) => page.locator('.client', { hasText: label }).first().click();
export const setMonth = async (page, ym) => { await page.locator('#month').fill(ym); await expect(page.locator('#month')).toHaveValue(ym); };
export const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
export const download = async (page, selector) => { const [d] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]); return { name: d.suggestedFilename(), bytes: await readFile(await d.path()) }; };
export const exportBtn = kind => '[data-act="export"][data-kind="' + kind + '"]';
