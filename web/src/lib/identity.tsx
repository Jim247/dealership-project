'use client';

/**
 * The demo identity switcher's state: who the page is acting as.
 *
 * MOCK AUTH (F9): this is a demo control, not authentication. The choice is
 * sent to the API as plain headers so the access rules can be shown. In
 * production the identity would come from a real sign-in and could not be
 * changed by the user.
 *
 * The choice is remembered in localStorage per browser for convenience only.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Identity } from '@debonaire/shared';

const STORAGE_KEY = 'debonaire.identity';
const DEFAULT_IDENTITY: Identity = { role: 'manager' };

interface IdentityContextValue {
  identity: Identity;
  setIdentity: (identity: Identity) => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children, initial }: { children: ReactNode; initial?: Identity }) {
  const [identity, setIdentityState] = useState<Identity>(initial ?? DEFAULT_IDENTITY);

  // Restore after mount (not during render), so server and client HTML match.
  useEffect(() => {
    if (initial) {
      return;
    }
    const stored = readStoredIdentity();
    if (stored) {
      setIdentityState(stored);
    }
  }, [initial]);

  const setIdentity = useCallback((next: Identity) => {
    setIdentityState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode). The switch still works for this visit.
    }
  }, []);

  const value = useMemo(() => ({ identity, setIdentity }), [identity, setIdentity]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);
  if (!value) {
    throw new Error('useIdentity must be used inside <IdentityProvider>.');
  }
  return value;
}

/** A stable string for an identity, used as a React key to reset state when it changes. */
export function identityKey(identity: Identity): string {
  return identity.role === 'dealer' ? `dealer:${identity.dealershipId}` : 'manager';
}

function readStoredIdentity(): Identity | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && 'role' in parsed) {
      if (parsed.role === 'manager') {
        return { role: 'manager' };
      }
      if (parsed.role === 'dealer' && 'dealershipId' in parsed && typeof parsed.dealershipId === 'string') {
        return { role: 'dealer', dealershipId: parsed.dealershipId };
      }
    }
  } catch {
    // Ignore unreadable storage and fall back to the default.
  }
  return null;
}
