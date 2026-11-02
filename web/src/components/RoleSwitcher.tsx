'use client';

/**
 * Demo control to act as a manager or as a dealer at one dealership.
 *
 * MOCK AUTH (F9): it exists only to show the access rules. It is labelled as
 * a demo in the UI so nobody mistakes it for real sign-in.
 */

import { useEffect, useState } from 'react';
import type { Dealership } from '@debonaire/shared';
import { apiClientFor } from '@/lib/api';
import { identityKey, useIdentity } from '@/lib/identity';
import styles from './RoleSwitcher.module.css';

export function RoleSwitcher() {
  const { identity, setIdentity } = useIdentity();
  const [dealerships, setDealerships] = useState<Dealership[]>([]);

  // The switcher lists every dealership, so it asks as a manager.
  useEffect(() => {
    const controller = new AbortController();
    apiClientFor({ role: 'manager' })
      .listDealerships(controller.signal)
      .then(setDealerships)
      .catch(() => {
        // If the API is down the page shows its own error. The switcher just offers "Manager".
      });
    return () => controller.abort();
  }, []);

  return (
    <div className={styles.switcher}>
      <label htmlFor="identity-switcher" className={styles.label}>
        Viewing as <span className={styles.demoTag}>demo</span>
      </label>
      <select
        id="identity-switcher"
        className={styles.select}
        value={identityKey(identity)}
        onChange={(event) => {
          const value = event.target.value;
          setIdentity(
            value === 'manager' ? { role: 'manager' } : { role: 'dealer', dealershipId: value.replace('dealer:', '') },
          );
        }}
      >
        <option value="manager">Manager (all dealerships)</option>
        {dealerships.map((d) => (
          <option key={d.id} value={`dealer:${d.id}`}>
            Dealer: {d.name}
          </option>
        ))}
        {/* Keep a stored dealer identity selectable while the list is still loading. */}
        {identity.role === 'dealer' && !dealerships.some((d) => d.id === identity.dealershipId) && (
          <option value={identityKey(identity)}>Dealer: {identity.dealershipId}</option>
        )}
      </select>
    </div>
  );
}
