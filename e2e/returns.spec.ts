/**
 * End-to-end journeys through the real page, PHP API and SQLite database.
 *
 * Covers spec §3.3 (form feedback, filterable table, totals, loading, empty
 * and failed states), §3.4 (the CLI prints the same figures as the page), and
 * the §4 edge cases as a user or a tampered browser would hit them.
 * The database is reset to the seed before every test (see Seeder.php for the data).
 */
import { expect, test, type Page } from '@playwright/test';
import {
  API_URL,
  expectTotals,
  readTotals,
  resetDatabase,
  returnsPanel,
  runSummary,
  submitPanel,
  type Figures,
} from './support';

const SEED_TOTALS: Figures = {
  Returns: '10',
  'Total enquiries': '2,090',
  'Total sales': '497',
  'Conversion rate': '23.78%',
};

/** Matches the list/submit endpoint (not /api/returns/{id}). */
const isReturnsEndpoint = (url: URL) => url.pathname === '/api/returns';

test.beforeEach(() => {
  resetDatabase();
});

async function openDashboard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(returnsPanel(page).getByRole('table')).toBeVisible();
}

async function fillReturn(page: Page, dealership: string, month: string, enquiries: string, sales: string) {
  const form = submitPanel(page);
  await form.getByLabel('Dealership', { exact: true }).selectOption({ label: dealership });
  await form.getByLabel('Reporting month').fill(month);
  await form.getByLabel('Enquiries').fill(enquiries);
  await form.getByLabel('Completed sales').fill(sales);
}

async function setPeriod(page: Page, from: string, to: string) {
  const panel = returnsPanel(page);
  await panel.getByLabel('From', { exact: true }).fill(from);
  await panel.getByLabel('To', { exact: true }).fill(to);
}

function rowFor(page: Page, dealership: string, monthLabel: string) {
  return returnsPanel(page).getByRole('row').filter({ hasText: dealership }).filter({ hasText: monthLabel });
}

test('a manager sees every seeded return with server totals, and N/A for zero enquiries', async ({ page }) => {
  await openDashboard(page);

  await expectTotals(page, SEED_TOTALS);
  await expect(returnsPanel(page).getByRole('row')).toHaveCount(11); // header + 10 returns
  await expect(rowFor(page, 'Harbour Cars', 'July 2026')).toContainText('N/A');
});

test('submitting a return saves it, confirms it, and refreshes the table and totals', async ({ page }) => {
  await openDashboard(page);

  await fillReturn(page, 'Riverside Autos', '2026-10', '131', '27');
  await page.getByRole('button', { name: 'Submit return' }).click();

  await expect(submitPanel(page).getByRole('status')).toContainText('Return saved for Riverside Autos, October 2026.');
  await expect(rowFor(page, 'Riverside Autos', 'October 2026')).toContainText('20.61%');
  await expectTotals(page, {
    Returns: '11',
    'Total enquiries': '2,221',
    'Total sales': '524',
    'Conversion rate': '23.59%',
  });
});

test('invalid figures are explained next to the field and nothing is saved', async ({ page }) => {
  await openDashboard(page);

  await fillReturn(page, 'Riverside Autos', '2026-10', '5', '9');
  await page.getByRole('button', { name: 'Submit return' }).click();

  await expect(submitPanel(page).getByLabel('Completed sales')).toHaveAttribute('aria-invalid', 'true');
  await expect(submitPanel(page).getByText('Sales (9) cannot be more than enquiries (5)')).toBeVisible();
  await expectTotals(page, SEED_TOTALS);
});

test('a second return for the same dealership and month gets a useful duplicate message', async ({ page }) => {
  await openDashboard(page);

  await fillReturn(page, 'Northgate Motors', '2026-10', '50', '10');
  await page.getByRole('button', { name: 'Submit return' }).click();

  const alert = submitPanel(page).getByRole('alert');
  await expect(alert).toContainText('This return has already been submitted.');
  await expect(alert).toContainText('Northgate Motors already has a return for October 2026 (submitted 3 Nov 2026)');
  await expectTotals(page, SEED_TOTALS);
});

test('retrying after a lost response does not create a duplicate', async ({ page }) => {
  await openDashboard(page);

  // Let the first POST reach the API (so it is saved) but drop its response, as
  // a flaky network would. The browser sees a failure for a return that exists.
  let dropped = false;
  await page.route(isReturnsEndpoint, async (route) => {
    if (route.request().method() === 'POST' && !dropped) {
      dropped = true;
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await fillReturn(page, 'Riverside Autos', '2026-10', '131', '27');
  await page.getByRole('button', { name: 'Submit return' }).click();
  await expect(submitPanel(page).getByRole('alert')).toContainText('We couldn’t reach the server.');

  // The user presses Submit again with the same data. The same Idempotency-Key
  // is sent, so the API replays the original success instead of a 409.
  await page.getByRole('button', { name: 'Submit return' }).click();

  await expect(submitPanel(page).getByRole('status')).toContainText('did not create a duplicate');
  await expect(rowFor(page, 'Riverside Autos', 'October 2026')).toHaveCount(1);
  await expectTotals(page, { Returns: '11', 'Total enquiries': '2,221', 'Total sales': '524', 'Conversion rate': '23.59%' });
});

test('a browser that bypasses the form cannot store bad data or its own totals', async ({ page }) => {
  await openDashboard(page);

  // Call the API from the page itself, skipping the form's checks entirely.
  const response = await page.evaluate(async (api) => {
    const res = await fetch(`${api}/api/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debonaire-Role': 'manager' },
      body: JSON.stringify({
        dealershipId: 'RVA',
        month: '2026-10',
        enquiries: 5,
        sales: 99,
        totals: { totalEnquiries: 1_000_000 },
      }),
    });
    return { status: res.status, body: await res.json() };
  }, API_URL);

  expect(response.status).toBe(422);
  expect(Object.keys(response.body.error.fields)).toEqual(expect.arrayContaining(['sales', 'totals']));

  await page.reload();
  await expectTotals(page, SEED_TOTALS);
});

test('filters show an empty month clearly and a zero-enquiry month correctly', async ({ page }) => {
  await openDashboard(page);

  await setPeriod(page, '2026-08', '2026-08');
  await expect(returnsPanel(page).getByText('No returns for this period.')).toBeVisible();
  await expectTotals(page, { Returns: '0', 'Total enquiries': '0', 'Total sales': '0', 'Conversion rate': 'N/A' });

  await setPeriod(page, '2026-07', '2026-07');
  await expectTotals(page, { Returns: '3', 'Total enquiries': '529', 'Total sales': '117', 'Conversion rate': '22.12%' });
});

test('the Node CLI prints exactly the same figures as the page', async ({ page }) => {
  await openDashboard(page);
  const panel = returnsPanel(page);

  const scenarios = [
    { from: '', to: '', dealership: '', caption: 'Totals for All months · All dealerships', cli: [] },
    { from: '2026-08', to: '2026-08', dealership: '', caption: 'Totals for 2026-08 · All dealerships', cli: ['--month', '2026-08'] },
    { from: '2026-07', to: '2026-07', dealership: '', caption: 'Totals for 2026-07 · All dealerships', cli: ['--month', '2026-07'] },
    { from: '', to: '', dealership: 'NGM', caption: 'Totals for All months · Northgate Motors', cli: ['--dealership', 'NGM'] },
    {
      from: '2026-06',
      to: '2026-09',
      dealership: 'HBC',
      caption: 'Totals for 2026-06 to 2026-09 · Harbour Cars',
      cli: ['--from', '2026-06', '--to', '2026-09', '--dealership', 'HBC'],
    },
  ];

  for (const scenario of scenarios) {
    await setPeriod(page, scenario.from, scenario.to);
    await panel.getByLabel('Dealership', { exact: true }).selectOption(scenario.dealership);

    const onPage = await readTotals(page, scenario.caption);
    const fromCli = runSummary(scenario.cli);

    expect(fromCli, scenario.caption).toEqual(onPage);
  }
});

test('a manager corrects a return, the totals follow, and the change is audited', async ({ page }) => {
  await openDashboard(page);

  await page.getByRole('button', { name: 'Correct Harbour Cars, June 2026' }).click();
  const dialog = page.getByRole('dialog', { name: 'Correct return: Harbour Cars, June 2026' });
  await dialog.getByLabel('Enquiries').fill('16');
  await dialog.getByLabel('Completed sales').fill('4');
  await dialog.getByLabel('Reason for correction').fill('Two web enquiries were missed in the CRM export');
  await dialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Correction saved for Harbour Cars.')).toBeVisible();
  await expect(rowFor(page, 'Harbour Cars', 'June 2026')).toContainText('25.00%');
  await expectTotals(page, { Returns: '10', 'Total enquiries': '2,092', 'Total sales': '498', 'Conversion rate': '23.80%' });

  await page.getByRole('button', { name: 'History for Harbour Cars, June 2026' }).click();
  const history = page.getByRole('dialog', { name: 'History: Harbour Cars, June 2026' });
  await expect(history.getByRole('listitem')).toHaveCount(2);
  await expect(history.getByRole('listitem').nth(1)).toContainText('Corrected by a manager');
  await expect(history.getByRole('listitem').nth(1)).toContainText('Enquiries 14 → 16, sales 3 → 4');
  await expect(history.getByRole('listitem').nth(1)).toContainText('Reason: Two web enquiries were missed in the CRM export');
});

test('a dealer only sees, and can only submit for, their own dealership', async ({ page }) => {
  await openDashboard(page);

  await page.getByLabel('Viewing as').selectOption({ label: 'Dealer: Harbour Cars' });

  const panel = returnsPanel(page);
  await expect(panel.getByText('Showing returns for Harbour Cars.')).toBeVisible();
  await expectTotals(page, { Returns: '3', 'Total enquiries': '23', 'Total sales': '5', 'Conversion rate': '21.74%' });
  await expect(panel.getByRole('rowheader')).toHaveText(['Harbour Cars', 'Harbour Cars', 'Harbour Cars']);
  await expect(panel.getByRole('button', { name: /^Correct / })).toHaveCount(0);
  await expect(panel.getByLabel('Dealership', { exact: true })).toHaveCount(0);

  const formDealership = submitPanel(page).getByLabel('Dealership', { exact: true });
  await expect(formDealership).toBeDisabled();
  await expect(formDealership).toHaveValue('HBC');
});

test('a failed request shows a clear error and recovers when retried', async ({ page }) => {
  await page.route(isReturnsEndpoint, (route) => route.abort('failed'));
  await page.goto('/');

  const alert = returnsPanel(page).getByRole('alert');
  await expect(alert).toContainText('We couldn’t load the returns.');
  await expect(page.getByRole('region', { name: 'Totals' })).toHaveCount(0);

  await page.unroute(isReturnsEndpoint);
  await alert.getByRole('button', { name: 'Try again' }).click();

  await expect(returnsPanel(page).getByRole('table')).toBeVisible();
  await expectTotals(page, SEED_TOTALS);
});
