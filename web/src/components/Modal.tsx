'use client';

/**
 * A minimal accessible modal: labelled dialog role, focus moves in on open and
 * back on close, and Escape or a backdrop click closes it.
 */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // Held in a ref so a new onClose function on each render does not re-run the focus effect.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>('input, textarea, select') ?? dialog;
    firstControl?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog} tabIndex={-1}>
        <div className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className={styles.close} onClick={() => onCloseRef.current()} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
