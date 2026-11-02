/**
 * The canonical reporting maths and number formatting.
 *
 * The PHP API (ReportCalculator.php) is the source of truth for totals. This
 * module is its exact twin, so the CLI can independently recompute and
 * cross-check the server's figures, and the web page formats numbers the
 * same way as the CLI. Both implementations are tested against the same
 * vectors in fixtures/conversion-cases.json.
 *
 * Features: F6 totals, F12 CLI cross-check, F13 canonical formula.
 */

import type { Totals } from './types';

/**
 * Conversion rate in basis points (1 bp = 0.01%), rounded half up, or null
 * when there are no enquiries (a rate is undefined, not 0%).
 *
 * Formula: floor((sales × 10000 × 2 + enquiries) ÷ (enquiries × 2)).
 * BigInt keeps the division exact, so the result is bit-for-bit identical to
 * PHP's intdiv(). Floating point would round values like 1.005% differently.
 */
export function conversionBasisPoints(sales: number, enquiries: number): number | null {
  assertCount(sales, 'sales');
  assertCount(enquiries, 'enquiries');

  if (enquiries === 0) {
    return null;
  }

  const numerator = BigInt(sales) * 20_000n + BigInt(enquiries);
  const denominator = BigInt(enquiries) * 2n;

  // BigInt division truncates, which equals floor for these non-negative values.
  return Number(numerator / denominator);
}

/** Conversion rate as a percentage with at most 2 dp, e.g. 23.78, or null. */
export function conversionRate(sales: number, enquiries: number): number | null {
  const basisPoints = conversionBasisPoints(sales, enquiries);
  return basisPoints === null ? null : basisPoints / 100;
}

/**
 * Totals for exactly the rows given, using a pooled rate (total sales ÷ total
 * enquiries), never an average of per-dealership rates.
 */
export function computeTotals(rows: ReadonlyArray<{ enquiries: number; sales: number }>): Totals {
  let totalEnquiries = 0;
  let totalSales = 0;

  for (const row of rows) {
    totalEnquiries += row.enquiries;
    totalSales += row.sales;
  }

  return {
    returnCount: rows.length,
    totalEnquiries,
    totalSales,
    conversionRate: conversionRate(totalSales, totalEnquiries),
  };
}

/**
 * Converts an API rate (e.g. 23.78) back to whole basis points.
 * Math.round absorbs float noise such as 23.78 × 100 = 2377.9999999999995.
 */
export function rateToBasisPoints(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 100);
}

/** "23.78%", "0.00%", "100.00%", or "N/A" when there were no enquiries. */
export function formatBasisPoints(basisPoints: number | null): string {
  if (basisPoints === null) {
    return 'N/A';
  }

  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, '0');
  return `${whole}.${fraction}%`;
}

/** Formats an API conversion rate for display. Used by both the web page and the CLI. */
export function formatRate(rate: number | null): string {
  return formatBasisPoints(rateToBasisPoints(rate));
}

const countFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

/** en-GB thousands separators: 2090 → "2,090". */
export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export interface TotalsMismatch {
  field: keyof Totals;
  server: number | null;
  recomputed: number | null;
}

/**
 * Lists every field where the server's totals disagree with totals recomputed
 * from the rows. Rates are compared in whole basis points, so float noise
 * never counts as a mismatch.
 */
export function compareTotals(server: Totals, recomputed: Totals): TotalsMismatch[] {
  const mismatches: TotalsMismatch[] = [];

  for (const field of ['returnCount', 'totalEnquiries', 'totalSales'] as const) {
    if (server[field] !== recomputed[field]) {
      mismatches.push({ field, server: server[field], recomputed: recomputed[field] });
    }
  }

  if (rateToBasisPoints(server.conversionRate) !== rateToBasisPoints(recomputed.conversionRate)) {
    mismatches.push({
      field: 'conversionRate',
      server: server.conversionRate,
      recomputed: recomputed.conversionRate,
    });
  }

  return mismatches;
}

function assertCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative whole number, got ${value}`);
  }
}
