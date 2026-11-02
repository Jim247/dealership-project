'use client';

/**
 * The single page: the submit form (F10) above the review panel (F11).
 *
 * After a successful submission or correction it bumps `refreshKey`, which
 * makes the panel reload its rows and totals from the API (spec §3.3 "refresh
 * the results after a successful submission").
 *
 * Switching the demo identity remounts everything (keyed by identity), so no
 * state from one identity can leak into another's view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiClient, Dealership, Identity } from '@debonaire/shared';
import { apiClientFor, toApiError } from '@/lib/api';
import { identityKey, useIdentity } from '@/lib/identity';
import { ReturnForm } from './ReturnForm';
import { ReturnsPanel } from './ReturnsPanel';

export function Dashboard() {
  const { identity } = useIdentity();
  const client = useMemo(() => apiClientFor(identity), [identity]);

  return <DashboardContent key={identityKey(identity)} client={client} identity={identity} />;
}

export function DashboardContent({ client, identity }: { client: ApiClient; identity: Identity }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [dealershipsError, setDealershipsError] = useState<string | null>(null);

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    client.listDealerships(controller.signal).then(
      (list) => !controller.signal.aborted && setDealerships(list),
      (error: unknown) =>
        !controller.signal.aborted &&
        setDealershipsError(
          toApiError(error).isNetworkError
            ? 'The reporting service is not responding, so the dealership list could not be loaded.'
            : toApiError(error).message,
        ),
    );
    return () => controller.abort();
  }, [client]);

  return (
    <>
      <section className="band">
        <div className="container">
          <h1>Dealership returns</h1>
          <p style={{ margin: 0, maxWidth: '60ch' }}>
            Submit each dealership’s monthly enquiries and completed sales, then review individual returns and
            totals for any period.
          </p>
        </div>
      </section>

      <main className="page-main">
        <div className="container">
          {dealershipsError && (
            <div className="alert alert-error" role="alert">
              <p>{dealershipsError}</p>
            </div>
          )}
          <ReturnForm client={client} identity={identity} dealerships={dealerships} onSubmitted={refresh} />
          <ReturnsPanel
            client={client}
            identity={identity}
            dealerships={dealerships}
            refreshKey={refreshKey}
            onChanged={refresh}
          />
        </div>
      </main>
    </>
  );
}
