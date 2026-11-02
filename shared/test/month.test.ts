/**
 * Covers the client-side mirror of the API's month rules (F3, F4).
 */
import { describe, expect, it } from 'vitest';
import { currentMonth, describePeriod, isValidMonth, monthLabel } from '../src/month';

describe('isValidMonth', () => {
  it.each(['2026-01', '2026-12', '1999-07'])('accepts %s', (value) => {
    expect(isValidMonth(value)).toBe(true);
  });

  it.each(['2026-13', '2026-00', '2026-3', '2026-03-01', ' 2026-03', '2026-03\n', '', null, 202603])(
    'rejects %j',
    (value) => {
      expect(isValidMonth(value)).toBe(false);
    },
  );
});

describe('currentMonth', () => {
  it('uses UK time, so 23:30 UTC on 31 May is already June (BST)', () => {
    expect(currentMonth(new Date('2026-05-31T23:30:00Z'))).toBe('2026-06');
  });

  it('matches UTC in winter (GMT)', () => {
    expect(currentMonth(new Date('2026-11-30T23:30:00Z'))).toBe('2026-11');
  });
});

describe('monthLabel', () => {
  it('names the month', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
  });

  it('leaves invalid input untouched', () => {
    expect(monthLabel('nonsense')).toBe('nonsense');
  });
});

describe('describePeriod', () => {
  it.each([
    ['2026-06', '2026-10', '2026-06 to 2026-10'],
    ['2026-08', '2026-08', '2026-08'],
    ['2026-06', null, '2026-06 onwards'],
    [null, '2026-10', 'up to 2026-10'],
    [null, null, 'All months'],
  ])('from %s to %s → %s', (from, to, expected) => {
    expect(describePeriod(from, to)).toBe(expected);
  });
});
