/**
 * The reporting summary: fetch returns for a period from the PHP API and
 * print the same totals and overall conversion rate as the web page.
 *
 * Consistency guarantee (spec §4 "Reporting consistency"): the printed figures
 * are the server's own totals, which are also what the page shows. Before
 * printing, the script recomputes the totals from the returned rows with the
 * shared formula. If anything disagrees it refuses to print and exits with
 * code 3, so wrong numbers never reach a report silently.
 *
 * Features: F12 CLI summary (spec §3.4), F6 totals, F13 shared formula.
 */

import {
  ApiError,
  compareTotals,
  computeTotals,
  createApiClient,
  describePeriod,
  formatCount,
  formatRate,
  type ReturnsReport,
} from '@debonaire/shared';
import { parseSummaryArgs, USAGE } from './args';

export const ExitCode = {
  Ok: 0,
  ApiError: 1,
  BadArguments: 2,
  TotalsMismatch: 3,
} as const;

export interface SummaryIo {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** Injected in tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
}

const LABEL_WIDTH = 18;

/**
 * Runs the summary and returns the process exit code. It never throws.
 */
export async function runSummary(argv: string[], io: SummaryIo): Promise<number> {
  const parsed = parseSummaryArgs(argv, io.env ?? {});

  if (parsed.kind === 'help') {
    io.stdout(USAGE);
    return ExitCode.Ok;
  }
  if (parsed.kind === 'error') {
    io.stderr(`Error: ${parsed.message}`);
    io.stderr('');
    io.stderr(USAGE);
    return ExitCode.BadArguments;
  }

  const { options } = parsed;
  // The summary is a management report, so it reads as a manager.
  // MOCK AUTH (F9): production would use a service account or token.
  const client = createApiClient({ baseUrl: options.apiUrl, identity: { role: 'manager' }, fetch: io.fetch });

  try {
    let dealershipLabel = 'All';
    if (options.dealershipId !== null) {
      const dealerships = await client.listDealerships();
      const match = dealerships.find((d) => d.id === options.dealershipId);
      if (!match) {
        io.stderr(
          `Error: unknown dealership "${options.dealershipId}". Known dealerships: ${dealerships.map((d) => d.id).join(', ')}.`,
        );
        return ExitCode.BadArguments;
      }
      dealershipLabel = `${match.name} (${match.id})`;
    }

    const report = await client.listReturns({
      from: options.from,
      to: options.to,
      dealershipId: options.dealershipId,
    });

    const mismatches = compareTotals(report.totals, computeTotals(report.data));
    if (mismatches.length > 0) {
      io.stderr('Error: the API totals do not match the returns it sent, so no summary was printed.');
      for (const { field, server, recomputed } of mismatches) {
        io.stderr(`  ${field}: API ${server ?? 'null'} vs recomputed ${recomputed ?? 'null'}`);
      }
      return ExitCode.TotalsMismatch;
    }

    for (const line of formatSummary(report, dealershipLabel)) {
      io.stdout(line);
    }
    return ExitCode.Ok;
  } catch (error) {
    io.stderr(describeError(error, options.apiUrl));
    return ExitCode.ApiError;
  }
}

/**
 * The printed summary. Number formatting comes from the shared package, so it
 * is character-for-character the same as the web page's totals.
 */
export function formatSummary(report: ReturnsReport, dealershipLabel: string): string[] {
  const row = (label: string, value: string) => `${`${label}:`.padEnd(LABEL_WIDTH)}${value}`;
  const { totals, filter } = report;

  const lines = [
    'Debonaire dealership summary',
    row('Period', describePeriod(filter.from, filter.to)),
    row('Dealership', dealershipLabel),
    row('Returns', formatCount(totals.returnCount)),
    row('Total enquiries', formatCount(totals.totalEnquiries)),
    row('Total sales', formatCount(totals.totalSales)),
    row('Conversion rate', formatRate(totals.conversionRate)),
  ];

  if (totals.returnCount === 0) {
    lines.push('', 'No returns found for this period.');
  }

  return lines;
}

function describeError(error: unknown, apiUrl: string): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return `Error: could not reach the Debonaire API at ${apiUrl}. Is it running? Start it with: npm run dev:api`;
    }

    const details = Object.entries(error.fields).map(([field, message]) => `\n  ${field}: ${message}`);
    return `Error: API responded ${error.status} (${error.code}): ${error.message}${details.join('')}`;
  }

  return `Error: ${(error as Error)?.message ?? String(error)}`;
}
