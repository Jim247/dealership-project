/**
 * Covers the public demo banner (D20, B15): it shows only when demo mode is
 * on, so local runs and the other suites look exactly as before.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DemoBanner } from '@/components/DemoBanner';
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
});

describe('DemoBanner', () => {
  it('shows nothing when NEXT_PUBLIC_DEMO_MODE is not set', () => {
    expect(DEMO_MODE).toBe(false);
    const { container } = render(<DemoBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains the demo when demo mode is on', () => {
    render(<DemoBanner enabled />);
    const banner = screen.getByRole('complementary', { name: 'About this demo' });
    expect(banner).toHaveTextContent('Public demo with made-up dealerships.');
    expect(banner).toHaveTextContent('anyone with the access code can switch to manager');
    expect(banner).toHaveTextContent('The data goes back to the sample data');
    expect(banner).toHaveTextContent('up to a minute');
  });
});
