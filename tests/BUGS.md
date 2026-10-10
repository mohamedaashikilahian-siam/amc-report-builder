# Bugs and open questions found while writing the tests

Nothing in `public/` was changed to fix these. The only app change was moving `expiryFlag` from `ui.js` to `core.js` with no change in behaviour (`ui.js` now calls it with the current month and date).
Each item has a test marked `todo` (unit) or `test.fail` (browser). They pass today by failing as described, and will start reporting "unexpectedly passing" once the app is fixed.

## Bugs

### BUG-1 carryForward depends on the order of the list (low)
- File: `public/js/core.js`, `carryForward`
- Steps: call `carryForward(client, reportsNewestFirst, '2026-10')`
- Expected: the last report before October is September, whatever order the list is in
- Actual: it takes the last item of the filtered list, so a newest-first list gives June
- Impact today: low. The app always passes reports sorted oldest first. It would bite any new caller.
- Test: `tests/unit/balances.test.mjs`

### BUG-2 an impossible date in a remark is accepted (low to medium)
- File: `public/js/core.js`, `expiryFlag` (was in `ui.js`)
- Steps: type `Oct 32, 2026` (or `Feb 30, 2027`) as a remark on 15 Oct 2026
- Expected: no flag, because it is not a date
- Actual: JavaScript rolls it into the next month, so the flag says "Due in 17 days."
- Test: `tests/unit/expiry.test.mjs`

### BUG-3 the "last 3 months" window is wrong at month ends (low)
- File: `public/js/core.js`, `amcState`
- Steps: today is 30 Nov 2026 and the AMC ends 1 Mar 2027
- Expected: 3 months from 30 Nov is 28 Feb, so the AMC is not yet in its last 3 months
- Actual: JavaScript turns "30 Feb" into 2 Mar, so the warning shows a few days early
- Test: `tests/unit/amc.test.mjs`

### BUG-4 a client can be saved with an AMC that ends before it starts (medium)
- File: `public/js/ui.js`, `saveClient`
- Steps: Add client, start 1 Jun 2026, end 31 Jan 2026, save
- Expected: an error message and no client saved
- Actual: the client is saved. Every month is then "after the AMC" and nothing can be created.
- Test: `tests/e2e/flows.spec.mjs`

### BUG-5 the 2-page layout breaks past certain sizes in the PDF (medium)
- File: `public/js/core.js`, `buildPdfDoc`
- Measured limits before the report needs a 3rd page (from the layout test):
  - Activities with short remarks: 13 fit, 14 overflow.
  - Activities with 90-character remarks: 7 fit, 8 overflow. A remark that long wraps to three lines.
  - History months: 20 fit, 21 overflow.
  - Summary text: 4,000 characters still fits.
  - Realistic cases fit: a 12-month history with 12 activities and 30-character remarks is exactly 2 pages.
- Expected: 2 pages per month
- Actual: past those limits the extra rows push the hours table or the history onto a 3rd page
- ⚠ Word layout was not measured, because there is no renderer here (see "Not tested")
- Tests: `tests/export/pdf-layout.test.mjs`

### BUG-6 Restore is not atomic and does not validate (medium)
- File: `public/js/ui.js`, `restoreAll`
- Steps: restore a file like `{"clients":{"x":"junk"},"reports":{"x_2026-01":5}}`
- Expected: "Restore failed" and the data untouched
- Actual: the message says it failed, but records were written one by one before the error, so `x: "junk"` is now stored
- Impact: a half-restored or corrupt file can leave bad records. Restore also silently replaces any record with the same id.
- ⚠ Only seen in browser-storage mode. In Firestore, `setDoc` would reject a non-object earlier, but a record with the wrong shape inside an object would still be saved.
- Test: `tests/e2e/downloads.spec.mjs`

## Open questions (⚠ business rules the code leaves unclear, so I did not assume)

- Q1 `1h30` (no unit after the minutes) is rejected today. Should it mean 1 h 30 m?
- Q2 A bare decimal `1.5` is read as 1.5 minutes and rounded to 2. Should it be minutes, or 1.5 hours?
- Q3 `1:75` is accepted as 1 h 75 m = 135 minutes. Should an invalid minute part be rejected?
- Q4 A report month before the AMC start date is allowed. Should it be blocked, like months after the end?
- Q5 A day-first date such as `20 Oct 2026` in a remark is ignored by the expiry warning. Only `Oct 20, 2026` is read. Which formats do your remarks use?
- Q6 ⚠ The "less than 20%" warning is exclusive (exactly 20% shows no warning). The tests assume that is intended.
- Q7 ⚠ The low-hours warning is also shown when remaining is 0. A fully used allocation is not "over", so it only says "less than 20% left". Fine?

## Not tested (see the report)
- Word layout and page count in real Word or LibreOffice.
- Anything against real Firestore: sign-in, `firestore.rules`, and live data. By design, tests never touch it.
