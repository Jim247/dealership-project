/**
 * Reporting-month helpers, matching the PHP Month class.
 *
 * Features: F3 period filters, F4 month rules (client-side mirror), F12 CLI arguments.
 */

/** Strict YYYY-MM with month 01–12. Same pattern as the API. */
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Business timezone. A UK dealership's month starts at midnight UK time. */
export const BUSINESS_TIMEZONE = 'Europe/London';

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

/** The month in progress right now in the UK, as YYYY-MM. */
export function currentMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  if (!isValidMonth(month)) {
    return month;
  }

  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  );
}

/**
 * Human description of a period filter, as shown by both the page and the CLI.
 */
export function describePeriod(from?: string | null, to?: string | null): string {
  if (from && to) {
    return from === to ? from : `${from} to ${to}`;
  }
  if (from) {
    return `${from} onwards`;
  }
  if (to) {
    return `up to ${to}`;
  }
  return 'All months';
}
