/**
 * Covers F6 totals and F13 the canonical formula. The fixture vectors are
 * shared with PHPUnit (ReportCalculatorTest), so passing here and there
 * proves the server and the CLI round identically.
 */
import { describe, expect, it } from 'vitest';
import fixture from '../../fixtures/conversion-cases.json';
import {
  compareTotals,
  computeTotals,
  conversionBasisPoints,
  conversionRate,
  formatBasisPoints,
  formatCount,
  formatRate,
} from '../src/reporting';

describe('conversion rate formula (shared vectors with PHP)', () => {
  it.each(fixture.cases)('$name', ({ sales, enquiries, basisPoints, display }) => {
    expect(conversionBasisPoints(sales, enquiries)).toBe(basisPoints);
    expect(formatBasisPoints(conversionBasisPoints(sales, enquiries))).toBe(display);
  });

  it('shows why floats are not used: toFixed gets 1.005% wrong', () => {
    expect(((201 / 20000) * 100).toFixed(2)).toBe('1.00');
    expect(formatRate(conversionRate(201, 20000))).toBe('1.01%');
  });

  it('rejects counts that are not non-negative whole numbers', () => {
    expect(() => conversionBasisPoints(-1, 10)).toThrow(RangeError);
    expect(() => conversionBasisPoints(1.5, 10)).toThrow(RangeError);
  });
});

describe('formatRate', () => {
  it('formats API rates to exactly two decimal places', () => {
    expect(formatRate(23.78)).toBe('23.78%');
    expect(formatRate(25)).toBe('25.00%');
    expect(formatRate(0)).toBe('0.00%');
    expect(formatRate(100)).toBe('100.00%');
  });

  it('shows N/A when there were no enquiries', () => {
    expect(formatRate(null)).toBe('N/A');
  });

  it('absorbs float noise from the JSON value', () => {
    // 23.78 * 100 is 2377.9999999999995 in IEEE-754.
    expect(formatRate(23.78)).toBe('23.78%');
    expect(formatRate(0.07)).toBe('0.07%');
  });
});

describe('formatCount', () => {
  it('uses en-GB thousands separators', () => {
    expect(formatCount(2090)).toBe('2,090');
    expect(formatCount(1000000)).toBe('1,000,000');
    expect(formatCount(0)).toBe('0');
  });
});

describe('computeTotals', () => {
  it('pools the rate across rows instead of averaging per-row rates', () => {
    const totals = computeTotals([
      { enquiries: 400, sales: 40 },
      { enquiries: 4, sales: 4 },
    ]);

    expect(totals).toEqual({ returnCount: 2, totalEnquiries: 404, totalSales: 44, conversionRate: 10.89 });
  });

  it('gives zero totals and a null rate for no rows', () => {
    expect(computeTotals([])).toEqual({ returnCount: 0, totalEnquiries: 0, totalSales: 0, conversionRate: null });
  });

  it('counts a zero-enquiry return without changing the rate', () => {
    expect(computeTotals([{ enquiries: 10, sales: 2 }, { enquiries: 0, sales: 0 }])).toEqual({
      returnCount: 2,
      totalEnquiries: 10,
      totalSales: 2,
      conversionRate: 20,
    });
  });
});

describe('compareTotals', () => {
  const totals = { returnCount: 10, totalEnquiries: 2090, totalSales: 497, conversionRate: 23.78 };

  it('finds no mismatch when the figures agree', () => {
    expect(compareTotals(totals, { ...totals })).toEqual([]);
  });

  it('treats float noise in the rate as equal', () => {
    expect(compareTotals(totals, { ...totals, conversionRate: 23.779999999999998 })).toEqual([]);
  });

  it('reports every field that differs', () => {
    expect(compareTotals(totals, { ...totals, totalSales: 498, conversionRate: 23.83 })).toEqual([
      { field: 'totalSales', server: 497, recomputed: 498 },
      { field: 'conversionRate', server: 23.78, recomputed: 23.83 },
    ]);
  });

  it('treats N/A versus a number as a mismatch', () => {
    expect(compareTotals({ ...totals, conversionRate: null }, totals)).toHaveLength(1);
  });
});
