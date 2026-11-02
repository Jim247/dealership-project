'use client';

/**
 * Manager-only view of a return's audit trail: who submitted it, and every
 * correction with its before and after values and reason.
 *
 * Features: F8 audit history (spec §4 "Access and audit history").
 */

import { useEffect, useState } from 'react';
import { formatCount, monthLabel, type ApiClient, type AuditEntry, type DealershipReturn } from '@debonaire/shared';
import { toApiError } from '@/lib/api';
import { Modal } from './Modal';
import styles from './HistoryDialog.module.css';

type HistoryState = { status: 'loading' } | { status: 'ready'; entries: AuditEntry[] } | { status: 'error'; message: string };

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/London',
});

export function HistoryDialog({
  client,
  target,
  onClose,
}: {
  client: ApiClient;
  target: DealershipReturn;
  onClose: () => void;
}) {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    client.getAudit(target.id, controller.signal).then(
      (entries) => !controller.signal.aborted && setState({ status: 'ready', entries }),
      (error: unknown) => !controller.signal.aborted && setState({ status: 'error', message: toApiError(error).message }),
    );
    return () => controller.abort();
  }, [client, target.id]);

  return (
    <Modal title={`History: ${target.dealershipName}, ${monthLabel(target.month)}`} onClose={onClose}>
      <div aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <p>Loading history…</p>}
        {state.status === 'error' && (
          <div className="alert alert-error" role="alert">
            <p>{state.message}</p>
          </div>
        )}
        {state.status === 'ready' && (
          <ol className={styles.timeline}>
            {state.entries.map((entry) => (
              <li key={entry.id}>
                <p className={styles.headline}>
                  <strong>{entry.action === 'created' ? 'Submitted' : 'Corrected'}</strong> by {actorLabel(entry)}
                  <span className={styles.when}> · {dateFormatter.format(new Date(entry.createdAt))}</span>
                </p>
                <p>{describeChange(entry)}</p>
                {entry.reason && <p className={styles.reason}>Reason: {entry.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}

function actorLabel(entry: AuditEntry): string {
  switch (entry.actorRole) {
    case 'seed':
      return 'sample data';
    case 'manager':
      return 'a manager';
    case 'dealer':
      return `the dealership (${entry.actorDealershipId})`;
  }
}

function describeChange(entry: AuditEntry): string {
  const after = `${formatCount(entry.after.enquiries)} enquiries, ${formatCount(entry.after.sales)} sales`;
  if (entry.before === null) {
    return after;
  }
  return `Enquiries ${formatCount(entry.before.enquiries)} → ${formatCount(entry.after.enquiries)}, sales ${formatCount(entry.before.sales)} → ${formatCount(entry.after.sales)}`;
}
