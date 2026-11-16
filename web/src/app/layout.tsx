import type { Metadata } from 'next';
import { Open_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AccessCodeGate } from '@/components/AccessCodeGate';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { AccessCodeProvider } from '@/lib/access';
import { DEMO_MODE } from '@/lib/demo';
import { IdentityProvider } from '@/lib/identity';
import './globals.css';

// Stand-in for a bank's proprietary typeface. Open Sans is a close, free humanist sans.
const openSans = Open_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'Dealership returns | Debonaire',
  description: 'Submit and review monthly dealership enquiries and sales.',
  // The public demo asks search engines not to list it (B15).
  ...(DEMO_MODE ? { robots: { index: false, follow: false } } : {}),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={openSans.variable}>
      <body>
        <IdentityProvider>
          {/* F15: on the public demo, the page asks for the access code before it shows anything. */}
          <AccessCodeProvider>
            <SiteHeader />
            <AccessCodeGate>{children}</AccessCodeGate>
            <SiteFooter />
          </AccessCodeProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
