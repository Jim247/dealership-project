/**
 * Command-line arguments for the summary script.
 *
 * Period flags are inclusive and use the same strict YYYY-MM rule as the API,
 * so a typo is caught locally with a clear message instead of an HTTP error.
 *
 * Features: F12 CLI summary (spec §3.4).
 */

import { parseArgs } from 'node:util';
import { isValidMonth } from '@debonaire/shared';

export const DEFAULT_API_URL = 'http://127.0.0.1:8000';

export const USAGE = `Usage: npm run summary -- [options]

Prints total enquiries, total sales and the overall conversion rate for a
reporting period, using the same figures as the Debonaire web page.

Options:
  --from YYYY-MM        first month to include (inclusive)
  --to YYYY-MM          last month to include (inclusive)
  --month YYYY-MM       a single month (shortcut for --from M --to M)
  --dealership ID       one dealership only, e.g. NGM
  --api URL             API base URL (default: $DEBONAIRE_API_URL or ${DEFAULT_API_URL})
  -h, --help            show this help

Examples:
  npm run summary -- --from 2026-06 --to 2026-10
  npm run summary -- --month 2026-08 --dealership NGM

Exit codes: 0 ok, 1 API error, 2 invalid arguments, 3 totals mismatch.`;

export interface SummaryOptions {
  from: string | null;
  to: string | null;
  dealershipId: string | null;
  apiUrl: string;
}

export type ParsedArgs =
  | { kind: 'run'; options: SummaryOptions }
  | { kind: 'help' }
  | { kind: 'error'; message: string };

export function parseSummaryArgs(argv: string[], env: Record<string, string | undefined> = {}): ParsedArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        from: { type: 'string' },
        to: { type: 'string' },
        month: { type: 'string' },
        dealership: { type: 'string' },
        api: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    // parseArgs explains unknown flags and missing values well, so reuse its message.
    return { kind: 'error', message: (error as Error).message };
  }

  if (values.help) {
    return { kind: 'help' };
  }

  if (values.month !== undefined && (values.from !== undefined || values.to !== undefined)) {
    return { kind: 'error', message: 'Use either --month or --from/--to, not both.' };
  }

  for (const flag of ['from', 'to', 'month'] as const) {
    const value = values[flag];
    if (value !== undefined && !isValidMonth(value)) {
      return { kind: 'error', message: `--${flag} must be a month in YYYY-MM format, e.g. 2026-03 (got "${value}").` };
    }
  }

  const from = values.month ?? values.from ?? null;
  const to = values.month ?? values.to ?? null;

  if (from !== null && to !== null && from > to) {
    return { kind: 'error', message: `--from (${from}) cannot be after --to (${to}).` };
  }

  const dealershipId = values.dealership?.trim() ?? null;
  if (dealershipId === '') {
    return { kind: 'error', message: '--dealership needs a dealership id, e.g. NGM.' };
  }

  return {
    kind: 'run',
    options: {
      from,
      to,
      dealershipId,
      apiUrl: values.api ?? env.DEBONAIRE_API_URL ?? DEFAULT_API_URL,
    },
  };
}
