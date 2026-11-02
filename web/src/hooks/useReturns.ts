'use client';

/**
 * Loads returns + server totals for a filter, and reloads whenever the filter
 * or `refreshKey` changes (the dashboard bumps it after a submission or
 * correction, spec §3.3).
 *
 * Out-of-order responses are discarded: each load aborts the previous one, so
 * a slow response for an old filter can never overwrite a newer one.
 *
 * Features: F11 table + totals with loading / empty / failed states.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, ApiError, ReturnsReport } from '@debonaire/shared';
import { toApiError } from '@/lib/api';

export interface ReturnsFilterValues {
  from: string;
  to: string;
  dealershipId: string;
}

export type ReturnsState =
  /** `report` holds the previous result while a reload is in flight (null on first load). */
  | { status: 'loading'; report: ReturnsReport | null }
  | { status: 'ready'; report: ReturnsReport }
  | { status: 'error'; error: ApiError };

export function useReturns(client: ApiClient, filter: ReturnsFilterValues, refreshKey: number) {
  const [state, setState] = useState<ReturnsState>({ status: 'loading', report: null });
  const [attempt, setAttempt] = useState(0);
  const { from, to, dealershipId } = filter;

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({
      status: 'loading',
      report: previous.status === 'ready' || previous.status === 'loading' ? previous.report : null,
    }));

    client.listReturns({ from, to, dealershipId }, controller.signal).then(
      (report) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', report });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ status: 'error', error: toApiError(error) });
        }
      },
    );

    return () => controller.abort();
  }, [client, from, to, dealershipId, refreshKey, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, retry };
}
