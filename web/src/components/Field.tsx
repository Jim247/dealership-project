/**
 * A labelled form control with an optional hint and an error message linked
 * by aria-describedby, so screen readers announce the error with the field.
 */

import { cloneElement, type ReactElement } from 'react';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactElement<Record<string, unknown>>;
}

export function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {/* Hints sit below the control so inputs in the same row stay aligned. */}
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
