/**
 * Public demo mode (D20, B15).
 *
 * The public copy on Vercel sets NEXT_PUBLIC_DEMO_MODE=true. That shows the
 * demo banner and asks search engines not to list the site. Local runs and
 * the test suites leave it unset, so they look exactly as before.
 *
 * Next.js copies NEXT_PUBLIC_ values into the page when it is built, so
 * changing the setting needs a new build (a redeploy on Vercel).
 */

/** True only for the exact text "true", so a typo never switches demo mode on. */
export function isDemoMode(value: string | undefined): boolean {
  return value === 'true';
}

// Written out in full: Next.js only swaps in the value for this exact expression.
export const DEMO_MODE = isDemoMode(process.env.NEXT_PUBLIC_DEMO_MODE);
