# AMC Report Builder

Plain HTML + ES modules, no build step, no backend. Firestore + Google sign-in.
Core logic: public/js/core.js. UI: public/js/ui.js. Storage: public/js/store.js.

## Commands
- npm start: serve on http://localhost:5173
- npm test: unit tests (node:test, tests/core.test.mjs)
- npm run test:e2e: Playwright tests (tests/e2e/)

## Rules
- NEVER run tests against production Firestore. E2E must stub
  firebase-config.js to null so the app uses localStorage.
- NEVER commit seed/ (real client data). Test data goes in tests/fixtures/
  and must be synthetic, with hand-calculated expected values.
- Expected values come from the requirements or hand calculation, never
  from the function's own output.
- Time is stored in whole minutes. Balances are derived from saved
  reports and never stored.
- Run npm test and npm run test:e2e after every change. Do not report
  done with failing tests.
- When writing tests, do NOT fix app code. Log bugs in tests/BUGS.md
  (file, steps, expected vs actual) and wait for my go-ahead.
- If a business rule is unclear, flag it with ⚠ and ask. Don't assume.
