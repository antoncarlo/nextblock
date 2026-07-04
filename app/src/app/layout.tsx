import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/shared/Providers';
import { TrackerScript } from '@/components/analytics/TrackerScript';

export const metadata: Metadata = {
  title: 'NextBlock | Tokenized Insurance Vaults',
  description:
    'Open infrastructure for tokenized insurance. Diversified vaults backed by on-chain, oracle, and off-chain verified policies.',
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
      </body>
    </html>
  );
}
