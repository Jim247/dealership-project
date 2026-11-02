import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p className={styles.title}>Debonaire</p>
        <p>
          Debonaire is a fictional brand created for a technical exercise. It is not a real bank, and all dealerships
          and figures are made up.
        </p>
        <p className={styles.muted}>Identity switching is a demo stand-in for real sign-in.</p>
      </div>
    </footer>
  );
}
