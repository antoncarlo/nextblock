'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useVaultAddresses } from '@/hooks/useVaultData';
import { useLpPositions } from '@/hooks/useLpPositions';
import { RedemptionFlow } from '@/components/portfolio/RedemptionFlow';
import { PositionRow } from '@/components/portfolio/PositionRow';
import { RedemptionHistory } from '@/components/redemption/RedemptionHistory';
import { getRedemptionQueueAddress } from '@/config/redemption';

/**
 * Portfolio — the LP's own view: what they hold, what it is worth, and the way
 * out. Withdrawals live here (not in a separate "Redeem" menu entry) because
 * exiting is something you do TO a position, not a standalone destination.
 */
export default function PortfolioPage() {
  const { isConnected } = useAccount();
  const { data: vaultAddresses, isLoading } = useVaultAddresses();
  const positions = useLpPositions();
  const queue = getRedemptionQueueAddress();
  // An empty positions box with no message reads as a loading failure. Say it.
  const holdsNothing = !positions.loading && positions.all.length > 0 && positions.held.length === 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAFAF8' }}>
      <div className="mx-auto px-4 py-8 sm:px-8" style={{ maxWidth: '1100px' }}>
        <p className="section-label" style={{ marginBottom: 4 }}>Your account</p>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 26,
            fontWeight: 400,
            color: '#0F1218',
            marginBottom: 8,
          }}
        >
          Portfolio
        </h1>
        <p className="mb-8 max-w-2xl text-sm leading-6 text-gray-500">
          Your positions across NextBlock vaults and the way to withdraw. Share value moves with the
          vault&apos;s net asset value — premiums earned raise it, claims paid lower it.
        </p>

        {!isConnected ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-600">Connect your wallet to see your positions.</p>
            <Link
              href="/app"
              className="mt-3 inline-block text-sm font-semibold"
              style={{ color: '#1B3A6B' }}
            >
              Browse the market →
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Your positions</h2>
                </div>
                {isLoading ? (
                  <div className="space-y-2 p-5">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100" />
                    ))}
                  </div>
                ) : !vaultAddresses || vaultAddresses.length === 0 ? (
                  <p className="p-6 text-sm text-gray-500">No vaults are deployed on this network.</p>
                ) : holdsNothing ? (
                  <div className="p-6">
                    <p className="text-sm text-gray-600">
                      You do not hold shares in any of the {positions.all.length} deployed vaults yet.
                    </p>
                    <Link
                      href="/app"
                      className="mt-2 inline-block text-sm font-semibold"
                      style={{ color: '#1B3A6B' }}
                    >
                      Browse the market →
                    </Link>
                  </div>
                ) : (
                  <div>
                    {vaultAddresses.map((addr) => (
                      <PositionRow key={addr} vaultAddress={addr} />
                    ))}
                  </div>
                )}
              </div>

              <RedemptionHistory />
            </div>

            <div className="lg:sticky lg:top-24 lg:self-start">
              <RedemptionFlow queueAddress={queue} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
