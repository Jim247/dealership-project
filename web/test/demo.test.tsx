/**
 * Covers the public demo switch (D20, B15): only the exact text "true" turns
 * it on, and it is off for local runs and every test suite.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_MODE, isDemoMode } from '@/lib/demo';

describe('isDemoMode', () => {
  it('is on only for the exact text "true"', () => {
    expect(isDemoMode('true')).toBe(true);
    expect(isDemoMode(undefined)).toBe(false);
    expect(isDemoMode('')).toBe(false);
    expect(isDemoMode('false')).toBe(false);
    expect(isDemoMode('TRUE')).toBe(false);
    expect(isDemoMode('1')).toBe(false);
  });

  it('is off when NEXT_PUBLIC_DEMO_MODE is not set', () => {
    expect(DEMO_MODE).toBe(false);
  });
});
