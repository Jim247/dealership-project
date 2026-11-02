/**
 * The four headline figures. They come straight from the server's `totals`,
 * which are computed from exactly the rows in the table below. The page does
 * no arithmetic of its own, so it can never disagree with the API or the CLI.
 *
 * Features: F11 totals display, F6 server totals.
 */

import { formatCount, formatRate, type Totals } from '@debonaire/shared';
import styles from './ReturnsPanel.module.css';

export function TotalsTiles({ totals, caption, stale }: { totals: Totals; caption: string; stale: boolean }) {
  const tiles = [
    { label: 'Returns', value: formatCount(totals.returnCount) },
    { label: 'Total enquiries', value: formatCount(totals.totalEnquiries) },
    { label: 'Total sales', value: formatCount(totals.totalSales) },
    { label: 'Conversion rate', value: formatRate(totals.conversionRate) },
  ];

  return (
    <section aria-label="Totals" className={stale ? styles.stale : undefined}>
      <p className={styles.totalsCaption}>{caption}</p>
      <dl className={styles.tiles}>
        {tiles.map((tile) => (
          <div key={tile.label} className={styles.tile}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.footnote}>
        Conversion rate = total sales ÷ total enquiries. It shows N/A when there are no enquiries.
      </p>
    </section>
  );
}
