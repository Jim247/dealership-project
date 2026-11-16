/**
 * Notice shown above the header on the public demo only (D20, B15).
 *
 * It tells visitors three things they would otherwise trip over: the
 * identity switch is a stand-in for sign-in, the data resets, and the API on
 * Render's free plan can take about a minute to wake up.
 */

import { DEMO_MODE } from '@/lib/demo';
import styles from './DemoBanner.module.css';

export function DemoBanner({ enabled = DEMO_MODE }: { enabled?: boolean }) {
  if (!enabled) {
    return null;
  }
  return (
    <aside className={styles.banner} aria-label="About this demo">
      <p className={`container ${styles.text}`}>
        <strong>Public demo with made-up dealerships.</strong> Sign-in is a stand-in, so anyone can switch to
        manager. The data goes back to the sample data whenever the server restarts, and after a quiet spell the
        first load can take up to a minute.
      </p>
    </aside>
  );
}
