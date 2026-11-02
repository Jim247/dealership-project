'use client';

/**
 * Review panel: period/dealership filters, server totals and the returns table,
 * with clear loading, empty and failed states (spec §3.3).
 *
 * Managers also get Correct and History actions (F8). A dealer's view is
 * scoped to their own dealership by the API, and the panel says so.
 *
 * Features: F11 filterable table + totals, F8 corrections UI, F9 role-aware view.
 */

import { useState } from 'react';
import { describePeriod, type ApiClient, type Dealership, type DealershipReturn, type Identity } from '@debonaire/shared';
import { useReturns, type ReturnsFilterValues } from '@/hooks/useReturns';
import { CorrectionDialog } from './CorrectionDialog';
import { Field } from './Field';
import { HistoryDialog } from './HistoryDialog';
import { ReturnsTable, ReturnsTableSkeleton } from './ReturnsTable';
import { TotalsTiles } from './TotalsTiles';
import styles from './ReturnsPanel.module.css';

interface ReturnsPanelProps {
  client: ApiClient;
  identity: Identity;
  dealerships: Dealership[];
  /** Bumped by the dashboard to force a reload, e.g. after a new submission. */
  refreshKey: number;
  /** Called after a correction, so the rest of the page can refresh too. */
  onChanged: () => void;
}

const EMPTY_FILTER: ReturnsFilterValues = { from: '', to: '', dealershipId: '' };

export function ReturnsPanel({ client, identity, dealerships, refreshKey, onChanged }: ReturnsPanelProps) {
  const isManager = identity.role === 'manager';
  const [filter, setFilter] = useState<ReturnsFilterValues>(EMPTY_FILTER);
  const { state, retry } = useReturns(client, filter, refreshKey);
  const [correcting, setCorrecting] = useState<DealershipReturn | null>(null);
  const [viewingHistory, setViewingHistory] = useState<DealershipReturn | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nameOf = (id: string | null) =>
    id === null ? 'All dealerships' : (dealerships.find((d) => d.id === id)?.name ?? id);

  // A 422 here means the filter itself is invalid, so show it next to the inputs, not as an outage.
  const filterErrors = state.status === 'error' && state.error.status === 422 ? state.error.fields : {};
  const report = state.status === 'error' ? null : state.report;
  const loading = state.status === 'loading';

  const setFilterField = (field: keyof ReturnsFilterValues) => (value: string) => {
    setNotice(null);
    setFilter((previous) => ({ ...previous, [field]: value }));
  };

  return (
    <section className="card" aria-labelledby="returns-heading">
      <h2 id="returns-heading">Returns</h2>
      <p className="card-intro">
        {isManager
          ? 'Every dealership’s returns. Filter by period or dealership.'
          : `Showin returns for ${nameOf(identity.dealershipId)}.`}
      </p>

      <form className={styles.filters} onSubmit={(e) => e.preventDefault()} aria-label="Filter returns">
        <Field id="filter-from" label="From" error={filterErrors.from}>
          <input
            className="input"
            type="month"
            placeholder="YYYY-MM"
            value={filter.from}
            onChange={(e) => setFilterField('from')(e.target.value)}
          />
        </Field>
        <Field id="filter-to" label="To" error={filterErrors.to}>
          <input
            className="input"
            type="month"
            placeholder="YYYY-MM"
            value={filter.to}
            onChange={(e) => setFilterField('to')(e.target.value)}
          />
        </Field>
        {isManager && (
          <Field id="filter-dealership" label="Dealership" error={filterErrors.dealershipId}>
            <select
              className="select"
              value={filter.dealershipId}
              onChange={(e) => setFilterField('dealershipId')(e.target.value)}
            >
              <option value="">All dealerships</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className={styles.filterActions}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setFilter(EMPTY_FILTER)}
            disabled={filter.from === '' && filter.to === '' && filter.dealershipId === ''}
          >
            Clear filters
          </button>
        </div>
      </form>

      {notice && (
        <div className="alert alert-success" role="status">
          <p>{notice}</p>
        </div>
      )}

      <div aria-live="polite" aria-busy={loading}>
        {loading && <p className={styles.loadingText}>{report ? 'Updating…' : 'Loading returns…'}</p>}

        {state.status === 'error' && state.error.status === 422 && (
          <div className="alert alert-warning" role="alert">
            <strong>Please check the filter.</strong>
            <p>{state.error.message}</p>
          </div>
        )}

        {state.status === 'error' && state.error.status !== 422 && (
          <div className="alert alert-error" role="alert">
            <strong>We couldn’t load the returns.</strong>
            <p>
              {state.error.isNetworkError
                ? 'The reporting service is not responding. Check your connection and try again.'
                : state.error.message}
            </p>
            <p>
              <button type="button" className="btn btn-small" onClick={retry}>
                Try again
              </button>
            </p>
          </div>
        )}

        {report === null && loading && <ReturnsTableSkeleton />}

        {report && (
          <>
            <TotalsTiles
              totals={report.totals}
              stale={loading}
              caption={`Totals for ${describePeriod(report.filter.from, report.filter.to)} · ${nameOf(report.filter.dealershipId)}`}
            />

            {report.data.length === 0 ? (
              <div className={styles.empty}>
                <p>
                  <strong>No returns for this period.</strong>
                </p>
                <p>Try a wider date range{isManager ? ' or another dealership' : ''}, or submit a return above.</p>
              </div>
            ) : (
              <ReturnsTable
                rows={report.data}
                showActions={isManager}
                stale={loading}
                onCorrect={(row) => {
                  setNotice(null);
                  setCorrecting(row);
                }}
                onHistory={setViewingHistory}
              />
            )}
          </>
        )}
      </div>

      {correcting && (
        <CorrectionDialog
          client={client}
          target={correcting}
          onClose={() => setCorrecting(null)}
          onCorrected={(updated) => {
            setCorrecting(null);
            setNotice(`Correction saved for ${updated.dealershipName}. The table and totals have been updated.`);
            onChanged();
          }}
        />
      )}

      {viewingHistory && (
        <HistoryDialog client={client} target={viewingHistory} onClose={() => setViewingHistory(null)} />
      )}
    </section>
  );
}
