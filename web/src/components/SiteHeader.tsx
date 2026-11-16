'use client';

/**
 * Site chrome: a red top band (segment label + demo identity switcher), then a
 * white header with the Debonaire mark and section navigation.
 *
 * While the public demo is asking for its access code (F15), the switcher is
 * hidden, because it cannot load the dealerships without the code.
 */

import { useAccessCode, useApiAllowed } from '@/lib/access';
import { Logo } from './Logo';
import { RoleSwitcher } from './RoleSwitcher';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  const { code } = useAccessCode();
  const apiAllowed = useApiAllowed();

  return (
    <header>
      <div className={styles.topBand}>
        <div className={`container ${styles.topBandInner}`}>
          <span className={styles.segment}>Business · Dealer Dashboard</span>
          {apiAllowed && <RoleSwitcher key={code ?? ''} />}
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
