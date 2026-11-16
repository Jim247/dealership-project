'use client';

/**
 * Shows the page, or the "Enter access code" screen in its place (F15, D22).
 *
 * The screen checks a typed code with the API before accepting it, so a
 * mistake is caught on the screen rather than after the dashboard starts
 * loading. On Render's free plan the first request after a quiet spell can
 * take about a minute while the API wakes up, so the screen says so while it
 * checks.
 */

import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { apiClientFor, toApiError } from '@/lib/api';
import { useAccessCode, type AccessCodeGate as GateReason } from '@/lib/access';
import { Field } from './Field';

/** What the API said about a code: accepted, refused, not reachable, or another failure. */
export type CodeCheck = 'ok' | 'invalid' | 'unreachable' | 'error';

/** Asks the API whether a code works, by listing dealerships with it. */
export async function checkCodeWithApi(code: string): Promise<CodeCheck> {
  try {
    await apiClientFor({ role: 'manager' }, { accessCode: code, onAccessCodeRejected: () => {} }).listDealerships();
    return 'ok';
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.isAccessCodeError) {
      return 'invalid';
    }
    return apiError.isNetworkError ? 'unreachable' : 'error';
  }
}

export function AccessCodeGate({
  children,
  check = checkCodeWithApi,
}: {
  children: ReactNode;
  check?: (code: string) => Promise<CodeCheck>;
}) {
  const { loaded, code, gate, acceptCode } = useAccessCode();

  // Until the saved code has been read, render nothing rather than start
  // requests that would go out without it.
  if (!loaded) {
    return null;
  }
  if (gate === 'none') {
    // A new code remounts the page, so every request is made again with it.
    return <Fragment key={code ?? ''}>{children}</Fragment>;
  }
  return <AccessCodeScreen reason={gate} check={check} onAccepted={acceptCode} />;
}

type ScreenStatus = 'idle' | 'empty' | 'checking' | Exclude<CodeCheck, 'ok'>;

const MESSAGES: Partial<Record<ScreenStatus, string>> = {
  invalid: "That access code isn't valid. Check it, or ask the person who shared the demo for the current one.",
  unreachable:
    'The reporting service is not responding. If the demo has been idle it can take up to a minute to wake up, so please try again shortly.',
  error: 'Something went wrong while checking the code. Please try again.',
};

function AccessCodeScreen({
  reason,
  check,
  onAccepted,
}: {
  reason: Exclude<GateReason, 'none'>;
  check: (code: string) => Promise<CodeCheck>;
  onAccepted: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<ScreenStatus>(reason === 'invalid' ? 'invalid' : 'idle');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = value.trim();
    if (typed === '') {
      setStatus('empty');
      return;
    }
    setStatus('checking');
    const result = await check(typed);
    if (result === 'ok') {
      onAccepted(typed);
    } else {
      setStatus(result);
    }
  }

  const message = MESSAGES[status];
  const checking = status === 'checking';

  return (
    <>
      <section className="band">
        <div className="container">
          <h1>Dealership returns</h1>
        </div>
      </section>

      <main className="page-main">
        <div className="container">
          <section className="card" aria-labelledby="access-code-heading">
            <h2 id="access-code-heading">Enter your access code</h2>
            <p className="card-intro">
              This demo is shared by invitation. Enter the access code you were given, or open the link you were
              sent.
            </p>

            {message && (
              <div className="alert alert-error" role="alert">
                <p>{message}</p>
              </div>
            )}

            <form onSubmit={submit} noValidate>
              <Field id="access-code" label="Access code" error={status === 'empty' ? 'Enter the access code.' : undefined}>
                <input
                  className="input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </Field>
              <div className="form-actions">
                <button type="submit" className="btn" disabled={checking}>
                  {checking ? 'Checking…' : 'Continue'}
                </button>
              </div>
              {checking && (
                <p role="status" className="field-hint">
                  Checking the code. If the demo has been idle, this can take up to a minute while it wakes up.
                </p>
              )}
            </form>
          </section>
        </div>
      </main>
    </>
  );
}
