/**
 * The Debonaire mark: an original bow-tie glyph and wordmark.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true" focusable="false">
        <path d="M2 2 L14 9 L14 13 L2 20 Q0 11 2 2 Z" fill="currentColor" />
        <path d="M32 2 L20 9 L20 13 L32 20 Q34 11 32 2 Z" fill="currentColor" />
        <rect x="14" y="7" width="6" height="8" rx="2" fill="currentColor" />
      </svg>
      <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em' }}>Debonaire</span>
    </span>
  );
}
