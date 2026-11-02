/**
 * End-to-end tests: a real browser drives a production build of the Next.js
 * page against the real PHP API and a real SQLite database. Nothing is mocked.
 *
 * The suite runs its own servers on separate ports with its own database file,
 * so it can run while `npm run dev` is up and never touches the dev data.
 */
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, E2E_DB, WEB_PORT, WEB_URL } from './e2e/support';

export default defineConfig({
  testDir: './e2e',
  // One shared database, reset before every test, so the tests run one at a time.
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // The PHP API with a freshly seeded e2e database.
      command: `php database/seed.php --fresh && php -S 127.0.0.1:${API_PORT} public/index.php`,
      cwd: 'api',
      url: `${API_URL}/api/health`,
      env: {
        DEBONAIRE_DB: E2E_DB,
        DEBONAIRE_ALLOWED_ORIGINS: WEB_URL,
        PHP_CLI_SERVER_WORKERS: '4',
      },
      // php -S logs every request to stderr. That is noise here; failures show in the test output.
      stderr: 'ignore',
      reuseExistingServer: false,
    },
    {
      // A production build of the page, pointed at the e2e API (baked in at build time).
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      cwd: 'web',
      url: WEB_URL,
      env: {
        NEXT_PUBLIC_API_URL: API_URL,
        NEXT_DIST_DIR: '.next-e2e',
      },
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
