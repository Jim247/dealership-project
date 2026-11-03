'use client';

/**
 * Site chrome: a red top band (segment label + demo identity switcher), then a
 * white header with the Debonaire mark and section navigation.
 */

import { Logo } from './Logo';
import { RoleSwitcher } from './RoleSwitcher';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header>
      <div className={styles.topBand}>
        <div className={`container ${styles.topBandInner}`}>
          <span className={styles.segment}>Business · Dealer Dashboard</span>
          <RoleSwitcher />
        </div>
      </div>
      <div className={styles.mainHeader}>
        <div className={`container ${styles.mainHeaderInner}`}>
          <a href="/" className={styles.brand} aria-label="Debonaire home">
            <Logo />
          </a>
          <nav aria-label="Main">
            <a href="/" className={styles.navLink} aria-current="page">
              Dealership returns
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}
