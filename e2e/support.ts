/**
 * Shared settings and helpers for the end-to-end suite.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const API_PORT = 8100;
export const WEB_PORT = 3100;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
/** The e2e suite's own database, separate from the dev data in debonaire.sqlite. */
export const E2E_DB = `${ROOT}api/var/e2e.sqlite`;

/** The four headline figures, as labelled on the page and in the CLI output. */
export type Figures = Record<'Returns' | 'Total enquiries' | 'Total sales' | 'Conversion rate', string>;

/**
 * Puts the e2e database back to exactly the seed data. Each request to the PHP
 * API opens a fresh connection, so replacing the file between tests is safe.
 */
export function resetDatabase(): void {
  execFileSync('php', ['api/database/seed.php', '--fresh'], {
    cwd: ROOT,
    env: { ...process.env, DEBONAIRE_DB: E2E_DB },
    stdio: 'ignore',
  });
}

/** The returns panel: filters, totals and table. */
export function returnsPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Returns', exact: true });
}

/**
 * The "Submit a return" card. Alerts are looked up inside it, because Next.js
 * adds its own page-level role="alert" route announcer.
 */
export function submitPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Submit a return', exact: true });
}

function totalsTile(page: Page, label: keyof Figures): Locator {
  return page
    .getByRole('region', { name: 'Totals' })
    .locator('dl > div')
    .filter({ has: page.locator('dt').getByText(label, { exact: true }) })
    .locator('dd');
}

/** Waits until every totals tile shows the expected value (the panel may still be reloading). */
export async function expectTotals(page: Page, expected: Figures): Promise<void> {
  for (const [label, value] of Object.entries(expected) as [keyof Figures, string][]) {
    await expect(totalsTile(page, label), label).toHaveText(value);
  }
}

/** Reads the totals once the panel has finished loading and shows the expected caption. */
export async function readTotals(page: Page, caption: string): Promise<Figures> {
  await expect(page.getByRole('region', { name: 'Totals' }).getByText(caption)).toBeVisible();
  await expect(returnsPanel(page).locator('div[aria-busy]')).toHaveAttribute('aria-busy', 'false');

  const labels: (keyof Figures)[] = ['Returns', 'Total enquiries', 'Total sales', 'Conversion rate'];
  const values = await Promise.all(labels.map((label) => totalsTile(page, label).textContent()));
  return Object.fromEntries(labels.map((label, i) => [label, values[i]?.trim() ?? ''])) as Figures;
}

/**
 * Runs the real Node CLI against the e2e API and returns its four figures.
 *
 * It starts Node directly with tsx, the same as `npm run summary`, because on
 * Windows `npm` is a .cmd file that execFileSync cannot start without a shell.
 */
export function runSummary(args: string[]): Figures {
  const output = execFileSync(process.execPath, ['--import', 'tsx', 'cli/src/main.ts', ...args, '--api', API_URL], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const figures: Partial<Figures> = {};
  for (const line of output.split('\n')) {
    const match = /^(Returns|Total enquiries|Total sales|Conversion rate):\s+(.+)$/.exec(line);
    if (match) {
      figures[match[1] as keyof Figures] = match[2]!.trim();
    }
  }
  return figures as Figures;
}
