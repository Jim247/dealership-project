'use client';

/**
 * The public demo's access code on the page (F15, D22).
 *
 * The public API refuses every request without the shared code. This
 * provider holds the code for the page and decides when to show the "Enter
 * access code" screen in its place:
 *
 * - A share link, /?code=..., saves the code and removes it from the address
 *   bar, so it isn't left on screen or in a copied address.
 * - Otherwise the code saved in this browser is used, like the demo identity.
 * - In demo mode with no code saved, the screen shows straight away.
 * - Whenever the API refuses the code (access_code_required or
 *   invalid_access_code), the screen comes back, with a message for a wrong
 *   code. This also covers a local run pointed at a protected API.
 *
 * A local run without demo mode, against an API that needs no code, never
 * shows the screen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ApiError } from '@debonaire/shared';
import { DEMO_MODE } from './demo';

const STORAGE_KEY = 'debonaire.accessCode';
const LINK_PARAM = 'code';

/** Why the code screen is showing: no code yet, or the API refused the one it had. */
export type AccessCodeGate = 'none' | 'required' | 'invalid';

/** What the API client needs: the code to send, and who to tell when it is refused. */
export interface AccessCodeClientOptions {
  accessCode: string | null;
  onAccessCodeRejected: (error: ApiError) => void;
}

interface AccessCodeContextValue {
  /** False until the saved code (or the share link) has been read after mount. */
  loaded: boolean;
  code: string | null;
  gate: AccessCodeGate;
  clientOptions: AccessCodeClientOptions;
  /** Saves a code the visitor typed in, and leaves the code screen. */
  acceptCode: (code: string) => void;
}

const NO_ACCESS_CODE: AccessCodeContextValue = {
  loaded: true,
  code: null,
  gate: 'none',
  clientOptions: { accessCode: null, onAccessCodeRejected: () => {} },
  acceptCode: () => {},
};

const AccessCodeContext = createContext<AccessCodeContextValue>(NO_ACCESS_CODE);

export function AccessCodeProvider({ children, demoMode = DEMO_MODE }: { children: ReactNode; demoMode?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [gate, setGate] = useState<AccessCodeGate>('none');

  // The code currently in use, so a refusal of an older code can be ignored.
  const codeRef = useRef<string | null>(null);

  const switchCode = useCallback((next: string | null) => {
    codeRef.current = next;
    setCode(next);
    writeStoredCode(next);
  }, []);

  // Read the share link or the saved code after mount (not during render), so
  // the server's HTML and the browser's first render match.
  useEffect(() => {
    const fromLink = takeCodeFromAddress();
    const initial = fromLink ?? readStoredCode();
    codeRef.current = initial;
    setCode(initial);
    if (fromLink !== null) {
      writeStoredCode(fromLink);
    }
    setGate(initial === null && demoMode ? 'required' : 'none');
    setLoaded(true);
  }, [demoMode]);

  const onAccessCodeRejected = useCallback(
    (error: ApiError, codeSent: string | null) => {
      if (codeSent !== codeRef.current) {
        return;
      }
      if (error.code === 'invalid_access_code') {
        // Forget a code that no longer works, so a reload asks again.
        switchCode(null);
        setGate('invalid');
      } else {
        setGate('required');
      }
    },
    [switchCode],
  );

  const acceptCode = useCallback(
    (next: string) => {
      switchCode(next.trim());
      setGate('none');
    },
    [switchCode],
  );

  const clientOptions = useMemo<AccessCodeClientOptions>(
    () => ({ accessCode: code, onAccessCodeRejected: (error) => onAccessCodeRejected(error, code) }),
    [code, onAccessCodeRejected],
  );

  const value = useMemo(
    () => ({ loaded, code, gate, clientOptions, acceptCode }),
    [loaded, code, gate, clientOptions, acceptCode],
  );
  return <AccessCodeContext.Provider value={value}>{children}</AccessCodeContext.Provider>;
}

/** The page's access code state. Outside a provider (as in unit tests) no code is used. */
export function useAccessCode(): AccessCodeContextValue {
  return useContext(AccessCodeContext);
}

/** True when the page may talk to the API: the code has been read and is not being asked for. */
export function useApiAllowed(): boolean {
  const { loaded, gate } = useAccessCode();
  return loaded && gate === 'none';
}

/**
 * Takes ?code=... out of the address bar and returns it, or null if there is
 * none. Other query parameters and the #fragment are kept.
 */
function takeCodeFromAddress(): string | null {
  const url = new URL(window.location.href);
  const fromLink = url.searchParams.get(LINK_PARAM)?.trim();
  if (fromLink === undefined) {
    return null;
  }
  url.searchParams.delete(LINK_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return fromLink === '' ? null : fromLink;
}

function readStoredCode(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    // Storage can be unavailable (private mode). The visitor is simply asked for the code.
    return null;
  }
}

function writeStoredCode(code: string | null): void {
  try {
    if (code === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, code);
    }
  } catch {
    // Unavailable storage only means the code is not remembered for next time.
  }
}
