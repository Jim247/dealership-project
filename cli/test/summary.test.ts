/**
 * Covers F12 the CLI summary end to end against a fake API: output format,
 * the empty-period case, the totals cross-check and error exit codes.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DealershipReturn, ReturnsReport } from '@debonaire/shared';
import { ExitCode, runSummary } from '../src/summary';

function row(dealershipId: string, month: string, enquiries: number, sales: number): DealershipReturn {
  return {
    id: 1,
    dealershipId,
    dealershipName: dealershipId,
    month,
    enquiries,
    sales,
    conversionRate: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
}

const july: ReturnsReport = {
  data: [row('NGM', '2026-07', 389, 88), row('RVA', '2026-07', 140, 29), row('HBC', '2026-07', 0, 0)],
  totals: { returnCount: 3, totalEnquiries: 529, totalSales: 117, conversionRate: 22.12 },
  filter: { from: '2026-07', to: '2026-07', dealershipId: null },
};

const emptyAugust: ReturnsReport = {
  data: [],
  totals: { returnCount: 0, totalEnquiries: 0, totalSales: 0, conversionRate: null },
  filter: { from: '2026-08', to: '2026-08', dealershipId: null },
};

/** A fake API that answers /api/returns with `report` and /api/dealerships with a fixed list. */
function fakeApi(report: ReturnsReport | Response) {
  return vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.includes('/api/dealerships')) {
      return Response.json({ data: [{ id: 'NGM', name: 'Northgate Motors' }, { id: 'RVA', name: 'Riverside Autos' }] });
    }
    return report instanceof Response ? report : Response.json(report);
  });
}

async function run(argv: string[], fetch: typeof globalThis.fetch) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runSummary(argv, { stdout: (l) => stdout.push(l), stderr: (l) => stderr.push(l), fetch });
  return { code, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

describe('runSummary', () => {
  it('prints the period totals and overall conversion rate', async () => {
    const result = await run(['--month', '2026-07'], fakeApi(july));

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toBe(
      [
        'Debonaire dealership summary',
        'Period:           2026-07',
        'Dealership:       All',
        'Returns:          3',
        'Total enquiries:  529',
        'Total sales:      117',
        'Conversion rate:  22.12%',
      ].join('\n'),
    );
    expect(result.stderr).toBe('');
  });

  it('requests the period from the API as the manager', async () => {
    const fetch = fakeApi(july);

    await run(['--from', '2026-06', '--to', '2026-10', '--api', 'http://api.test'], fetch);

    const [url, init] = fetch.mock.calls.at(-1)! as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/returns?from=2026-06&to=2026-10');
    expect(init.headers).toMatchObject({ 'X-Debonaire-Role': 'manager' });
  });

  it('shows zero totals, N/A and a clear message for a month with no returns', async () => {
    const result = await run(['--month', '2026-08'], fakeApi(emptyAugust));

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain('Total enquiries:  0');
    expect(result.stdout).toContain('Conversion rate:  N/A');
    expect(result.stdout).toContain('No returns found for this period.');
  });

  it('names the dealership when filtering by one', async () => {
    const fetch = fakeApi({ ...july, filter: { ...july.filter, dealershipId: 'NGM' } });

    const result = await run(['--month', '2026-07', '--dealership', 'NGM'], fetch);

    expect(result.stdout).toContain('Dealership:       Northgate Motors (NGM)');
    expect(String(fetch.mock.calls.at(-1)![0])).toContain('dealershipId=NGM');
  });

  it('rejects an unknown dealership before asking for returns', async () => {
    const fetch = fakeApi(july);

    const result = await run(['--dealership', 'ZZZ'], fetch);

    expect(result.code).toBe(ExitCode.BadArguments);
    expect(result.stderr).toContain('unknown dealership "ZZZ". Known dealerships: NGM, RVA.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses to print when the API totals disagree with its own rows', async () => {
    const tampered = { ...july, totals: { ...july.totals, totalSales: 120 } };

    const result = await run(['--month', '2026-07'], fakeApi(tampered));

    expect(result.code).toBe(ExitCode.TotalsMismatch);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('totalSales: API 120 vs recomputed 117');
  });

  it('exits 1 with a helpful message when the API is down', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const result = await run(['--api', 'http://127.0.0.1:9'], fetch);

    expect(result.code).toBe(ExitCode.ApiError);
    expect(result.stderr).toContain('could not reach the Debonaire API at http://127.0.0.1:9');
    expect(result.stderr).toContain('npm run dev:api');
  });

  it('exits 1 and shows the API error envelope on an HTTP error', async () => {
    const error = Response.json(
      { error: { code: 'validation_failed', message: 'The report filter is not valid.', fields: { to: 'Bad.' } } },
      { status: 422 },
    );

    const result = await run(['--month', '2026-07'], fakeApi(error));

    expect(result.code).toBe(ExitCode.ApiError);
    expect(result.stderr).toContain('API responded 422 (validation_failed): The report filter is not valid.');
    expect(result.stderr).toContain('to: Bad.');
  });

  it('exits 2 with usage for invalid arguments, without calling the API', async () => {
    const fetch = fakeApi(july);

    const result = await run(['--from', '2026-9'], fetch);

    expect(result.code).toBe(ExitCode.BadArguments);
    expect(result.stderr).toContain('Usage: npm run summary');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prints usage for --help', async () => {
    const result = await run(['--help'], fakeApi(july));

    expect(result.code).toBe(ExitCode.Ok);
    expect(result.stdout).toContain('--from YYYY-MM');
  });
});
