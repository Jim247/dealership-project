import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { IdentityProvider } from '@/lib/identity';
import './globals.css';

// Stand-in for a bank's proprietary typeface. Open Sans is a close, free humanist sans.
const openSans = Open_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Dealership returns | Debonaire',
  description: 'Submit and review monthly dealership enquiries and sales.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={openSans.variable}>
      <body>
        <IdentityProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </IdentityProvider>
      </body>
    </html>
  );
}
