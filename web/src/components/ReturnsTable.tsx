/**
 * The saved returns, one row per dealership per month.
 *
 * Features: F11 returns table, F8 manager actions (Correct, History).
 */

import { formatCount, formatRate, monthLabel, type DealershipReturn } from '@debonaire/shared';
import styles from './ReturnsPanel.module.css';

interface ReturnsTableProps {
  rows: DealershipReturn[];
  showActions: boolean;
  stale: boolean;
  onCorrect: (row: DealershipReturn) => void;
  onHistory: (row: DealershipReturn) => void;
}

export function ReturnsTable({ rows, showActions, stale, onCorrect, onHistory }: ReturnsTableProps) {
  return (
    <div className={`${styles.tableWrap} ${stale ? styles.stale : ''}`}>
      <table className={styles.table}>
        <caption className="visually-hidden">Saved dealership returns</caption>
        <thead>
          <tr>
            <th scope="col">Dealership</th>
            <th scope="col">Month</th>
            <th scope="col" className={styles.num}>
              Enquiries
            </th>
            <th scope="col" className={styles.num}>
              Sales
            </th>
            <th scope="col" className={styles.num}>
              Conversion
            </th>
            {showActions && (
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = `${row.dealershipName}, ${monthLabel(row.month)}`;
            return (
              <tr key={row.id}>
                <th scope="row">{row.dealershipName}</th>
                <td>{monthLabel(row.month)}</td>
                <td className={styles.num}>{formatCount(row.enquiries)}</td>
                <td className={styles.num}>{formatCount(row.sales)}</td>
                <td className={styles.num}>{formatRate(row.conversionRate)}</td>
                {showActions && (
                  <td className={styles.actions}>
                    <button type="button" className="btn btn-secondary btn-small" onClick={() => onCorrect(row)} aria-label={`Correct ${name}`}>
                      Correct
                    </button>
                    <button type="button" className="btn-link" onClick={() => onHistory(row)} aria-label={`History for ${name}`}>
                      History
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Placeholder rows while the first load is in flight. */
export function ReturnsTableSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  );
}
