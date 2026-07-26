'use client';

import Link from 'next/link';
import { useAccount } from 'wagmi';
import { usePlatformSnapshot } from '@/hooks/usePlatformSnapshot';
import { useMultiVaultInfo, useVaultAddresses } from '@/hooks/useVaultData';
import { formatUSDCCompact, shortenAddress } from '@/lib/formatting';
import { fmtBps, bpsOf } from '@/lib/platform-metrics';
import { curationConsoleHref } from '@/lib/governance/curation';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * The Syndicate's curation book: which deployed vaults this wallet curates,
 * which are still free to be taken on, and which belong to someone else.
 *
 * Follows the Morpho grammar — a curator is the risk officer of a vault, not a
 * vault factory. A vault deployed without a syndicate can now be taken into
 * curation (`InsuranceVault.assignSyndicate`), but that call is OWNER_ROLE-gated
 * and one-way: a syndicate cannot appoint itself, and an incumbent is never
 * displaced. So the take-over here is a *request* that produces the exact
 * governance operation, not a button that pretends to have authority.
 */
export function CurationBook() {
  const { address } = useAccount();
  const { vaults, totals, isLoading } = usePlatformSnapshot();
  const { data: addresses } = useVaultAddresses();
  const { data: infos } = useMultiVaultInfo(addresses);

  // Manager lives at tuple index 1 of the vault read model.
  const managerOf = new Map<string, string>();
  if (addresses && infos) {
    addresses.forEach((addr, i) => {
      const info = infos[i];
      if (info?.status === 'success' && info.result) {
        const t = info.result as unknown as [string, `0x${string}`, ...unknown[]];
        managerOf.set(addr.toLowerCase(), t[1].toLowerCase());
      }
    });
  }

  const mine = vaults.filter((v) => address && managerOf.get(v.address.toLowerCase()) === address.toLowerCase());
  // A vault whose manager slot is still zero has no syndicate: it is the only
  // kind that can be taken on, because assignSyndicate refuses the rest.
  const awaiting = vaults.filter(
    (v) => !mine.includes(v) && managerOf.get(v.address.toLowerCase()) === ZERO_ADDRESS,
  );
  const others = vaults.filter((v) => !mine.includes(v) && !awaiting.includes(v));
  const myTvl = mine.reduce((acc, v) => acc + v.totalAssets, 0n);

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-100" />;
  }

  return (
    <div className="space-y-6">
      {/* What this syndicate curates */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Vaults you curate</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              You set the risk parameters and allocation strategy for these.
            </p>
          </div>
          {mine.length > 0 && (
            <p className="text-xs text-gray-500">
              <strong className="text-gray-900">{formatUSDCCompact(myTvl)}</strong> under curation ·{' '}
              {fmtBps(bpsOf(myTvl, totals.tvl))} of protocol TVL
            </p>
          )}
        </div>

        {mine.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-gray-600">This wallet does not curate any vault yet.</p>
            <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-gray-500">
              {awaiting.length > 0 ? (
                <>
                  {awaiting.length} deployed vault{awaiting.length === 1 ? ' has' : 's have'} no
                  syndicate yet — you can ask to take {awaiting.length === 1 ? 'it' : 'one'} on below,
                  or have a new vault deployed under your curation.
                </>
              ) : (
                <>
                  Every deployed vault already has a syndicate. To curate, a new vault must be
                  deployed with your wallet as its syndicate — an incumbent is never displaced.
                </>
              )}
            </p>
            <Link
              href="/app/create-vault"
              className="mt-4 inline-block rounded-full px-5 py-2 text-xs font-semibold text-white"
              style={{ background: '#1B3A6B' }}
            >
              Set up a vault under your curation
            </Link>
          </div>
        ) : (
          <VaultLines vaults={mine} tvl={totals.tvl} manage />
        )}
      </section>

      {/* Free vaults: the only ones assignSyndicate will accept */}
      {awaiting.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Vaults awaiting curation</h3>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-gray-500">
              Deployed with no syndicate on record. Requesting one prepares the on-chain operation
              and hands it to protocol governance — appointment is owner-gated and passes the
              timelock, so no wallet can take a vault on its own authority. Once assigned, curation
              cannot be transferred away by a single transaction.
            </p>
          </div>
          <div>
            {awaiting.map((v) => (
              <div
                key={v.address}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/app/vault/${v.address}`}
                    className="text-sm font-medium text-gray-900 hover:underline"
                  >
                    {v.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {shortenAddress(v.address)} · no syndicate
                  </p>
                </div>
                <div className="flex items-center gap-5 text-right">
                  <div>
                    <p className="text-xs text-gray-400">TVL</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatUSDCCompact(v.totalAssets)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Policies</p>
                    <p className="text-sm font-semibold text-gray-900">{v.policyCount}</p>
                  </div>
                  {address ? (
                    <Link
                      href={curationConsoleHref(v.address as `0x${string}`, address)}
                      className="rounded-full px-4 py-1.5 text-xs font-semibold text-white"
                      style={{ background: '#1B3A6B' }}
                    >
                      Request curation
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-400">Connect to request</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Everything else on the protocol, read-only */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Curated by other syndicates</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            The rest of the protocol — visible to everyone, editable by their own syndicate only.
          </p>
        </div>
        {others.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            No other vaults are deployed on this network.
          </p>
        ) : (
          <VaultLines vaults={others} tvl={totals.tvl} managerOf={managerOf} />
        )}
      </section>
    </div>
  );
}

function VaultLines({
  vaults,
  tvl,
  manage = false,
  managerOf,
}: {
  vaults: ReturnType<typeof usePlatformSnapshot>['vaults'];
  tvl: bigint;
  manage?: boolean;
  managerOf?: Map<string, string>;
}) {
  return (
    <div>
      {vaults.map((v) => (
        <div
          key={v.address}
          className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-50 px-5 py-4 last:border-b-0"
        >
          <div className="min-w-0">
            <Link href={`/app/vault/${v.address}`} className="text-sm font-medium text-gray-900 hover:underline">
              {v.name}
            </Link>
            <p className="mt-0.5 text-xs text-gray-400">
              {shortenAddress(v.address)}
              {managerOf && ` · syndicate ${shortenAddress((managerOf.get(v.address.toLowerCase()) ?? '') as `0x${string}`)}`}
            </p>
          </div>
          <div className="flex items-center gap-5 text-right">
            <div>
              <p className="text-xs text-gray-400">TVL</p>
              <p className="text-sm font-semibold text-gray-900">{formatUSDCCompact(v.totalAssets)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Share of protocol</p>
              <p className="text-sm font-semibold text-gray-900">{fmtBps(bpsOf(v.totalAssets, tvl))}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Policies</p>
              <p className="text-sm font-semibold text-gray-900">{v.policyCount}</p>
            </div>
            {manage && (
              <Link
                href={`/app/vault/${v.address}/manage`}
                className="rounded-full border px-4 py-1.5 text-xs font-semibold"
                style={{ borderColor: 'rgba(27,58,107,0.25)', color: '#1B3A6B' }}
              >
                Curate
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
