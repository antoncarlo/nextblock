import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/shared/Providers';
import { TrackerScript } from '@/components/analytics/TrackerScript';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  title: 'NextBlock | Tokenized Insurance Vaults',
  description:
    'Open infrastructure for tokenized insurance. Diversified vaults backed by on-chain, oracle, and off-chain verified policies.',
  // Base App domain-ownership verification (renders as
  // <meta name="base:app_id" content="…"> in the homepage head).
  other: {
    'base:app_id': '6a596b7558aaa84e3d067546',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          {children}
        </Providers>
        {/* Internal analytics (renders nothing; sendBeacon fire-and-forget). */}
        <TrackerScript />
        {/* Vercel Web Analytics (owner-requested; complements the internal
            system with Vercel's own dashboard — enable it in the Vercel UI). */}
        <Analytics />
      </body>
    </html>
  );
}
