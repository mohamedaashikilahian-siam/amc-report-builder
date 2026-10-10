import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 5174);
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  outputDir: '../../test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:' + PORT, acceptDownloads: true },
  webServer: { command: 'node tests/e2e/serve.mjs', url: 'http://localhost:' + PORT, reuseExistingServer: false, cwd: '../..' },
});
