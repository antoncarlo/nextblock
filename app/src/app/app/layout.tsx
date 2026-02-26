import { Header } from '@/components/shared/Header';
import { AutoDisconnect } from '@/components/shared/AutoDisconnect';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AutoDisconnect />
      <Header />
      <main>{children}</main>

      {/* Venetian footer frieze */}
      <footer
        style={{
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        {/* Decorative illustration */}
        <div className="w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/venice-footer-frieze.png"
            alt=""
            aria-hidden="true"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              objectFit: 'cover',
            }}
          />
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <div
            className="mx-auto flex flex-col md:flex-row items-center justify-between gap-4"
            style={{
              maxWidth: '1200px',
              padding: '20px 40px',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                color: '#9A9A9A',
              }}
            >
              © 2025 NextBlock. All rights reserved.
            </p>
            <p
              style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '13px',
                color: '#9A9A9A',
              }}
            >
              Built on Base · Secured by Ethereum
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
