'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import {
  PREMIUM_DISTRIBUTOR_ABI,
  MOCK_USDC_ABI,
} from '@/config/contracts';
import { useAddresses } from '@/hooks/useAddresses';
import { useAllPortfolios, PortfolioStatus, type PortfolioView } from '@/hooks/usePortfolioRegistry';
import { useVaultAddresses } from '@/hooks/useVaultData';
import { formatUSDC, shortenAddress } from '@/lib/formatting';

/**
 * The premium route that keeps the split intact.
 *
 * A cedant is meant to pay through `PremiumDistributor.receivePremium`, which
 * divides the gross into the LP quota, the protocol fee and the underwriting
 * fee before forwarding anything to the vault. Neither half of that route had
 * an interface, so the only way to get a premium into a vault from the browser
 * was a direct `depositPremium` — which skips the split entirely.
 *
 * Two halves, two roles:
 *
 *  - the **curator** binds a portfolio to the vault that will carry it
 *    (`setPortfolioVault`, UNDERWRITING_CURATOR_ROLE). Without the binding
 *    `receivePremium` reverts with `VaultNotSet`;
 *  - the **cedant** pays the gross premium (`receivePremium`,
 *    AUTHORIZED_CEDANT_ROLE). It also requires the portfolio to be allocatable
 *    — APPROVED or ACTIVE — so a submitted-but-unapproved portfolio cannot be
 *    funded.
 *
 * The split is read from `previewSplit` on the contract, never recomputed here.
 * Rounding is deliberate on-chain (fees round up, dust shrinks the LP quota);
 * a second implementation in TypeScript would eventually disagree with the
 * first, and the number people act on should be the one the chain will use.
 */

function parseUSDC(value: string): bigint {
  const n = parseFloat(value);
  if (isNaN(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 1_000_000));
}

const ZERO = '0x0000000000000000000000000000000000000000';

export function PremiumRoutePanel({ mode }: { mode: 'cedant' | 'curator' }) {
  const { portfolios, isLoading, refetch } = useAllPortfolios();

  const allocatable = useMemo(
    () =>
      portfolios.filter(
        (p) => p.status === PortfolioStatus.APPROVED || p.status === PortfolioStatus.ACTIVE,
      ),
    [portfolios],
  );

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-gray-100" />;
  }

  if (allocatable.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Premium routing</h3>
        <p className="mt-2 text-sm text-gray-500">
          No portfolio is approved yet. A premium can only be paid against an approved or active
          portfolio, so this opens once one clears review.
        </p>
      </section>
    );
  }

  return mode === 'curator' ? (
    <BindPortfolioToVault portfolios={allocatable} onDone={refetch} />
  ) : (
    <PayPremium portfolios={allocatable} />
  );
}

// ── Curator half: bind the portfolio to the vault that will carry it ─────────

function BindPortfolioToVault({
  portfolios,
  onDone,
}: {
  portfolios: PortfolioView[];
  onDone: () => void;
}) {
  const addresses = useAddresses();
  const { data: vaults } = useVaultAddresses();
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [vault, setVault] = useState<string>('');
  const notified = useRef<string | null>(null);

  const chosenPortfolio = portfolioId || portfolios[0]?.portfolioId.toString() || '';
  const vaultList = (vaults ?? []) as readonly `0x${string}`[];
  const chosenVault = vault || vaultList[0] || '';

  const { data: boundRaw, refetch: refetchBound } = useReadContract({
    address: addresses.premiumDistributor as `0x${string}`,
    abi: PREMIUM_DISTRIBUTOR_ABI,
    functionName: 'portfolioVault',
    args: chosenPortfolio ? [BigInt(chosenPortfolio)] : undefined,
    query: { enabled: Boolean(chosenPortfolio) },
  });
  const bound = typeof boundRaw === 'string' ? boundRaw : ZERO;
  const alreadyBound = bound !== ZERO;

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!isSuccess || !hash || notified.current === hash) return;
    notified.current = hash;
    void refetchBound();
    onDone();
  }, [isSuccess, hash, refetchBound, onDone]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">Bind a portfolio to its vault</h3>
      <p className="mt-0.5 max-w-2xl text-xs leading-5 text-gray-500">
        The distributor needs to know which vault carries a portfolio before it can forward the LP
        quota. Until this is set, a cedant paying the premium is rejected with{' '}
        <code>VaultNotSet</code>.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Portfolio
          </span>
          <select
            value={chosenPortfolio}
            onChange={(e) => setPortfolioId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {portfolios.map((p) => (
              <option key={p.portfolioId.toString()} value={p.portfolioId.toString()}>
                #{p.portfolioId.toString()} · {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Vault
          </span>
          <select
            value={chosenVault}
            onChange={(e) => setVault(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {vaultList.length === 0 && <option value="">No vault deployed</option>}
            {vaultList.map((v) => (
              <option key={v} value={v}>
                {shortenAddress(v)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        {alreadyBound ? (
          <>
            Currently bound to <code>{shortenAddress(bound as `0x${string}`)}</code>. Rebinding
            redirects future premiums; it does not move premiums already paid.
          </>
        ) : (
          'Not bound yet.'
        )}
      </p>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error.message.slice(0, 180)}
        </p>
      )}

      <button
        type="button"
        disabled={isPending || !chosenPortfolio || !chosenVault}
        onClick={() =>
          writeContract({
            address: addresses.premiumDistributor as `0x${string}`,
            abi: PREMIUM_DISTRIBUTOR_ABI,
            functionName: 'setPortfolioVault',
            args: [BigInt(chosenPortfolio), chosenVault as `0x${string}`],
          })
        }
        className="mt-4 rounded-full px-5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: '#1B3A6B' }}
      >
        {isPending ? 'Confirm in wallet…' : alreadyBound ? 'Rebind to this vault' : 'Bind to this vault'}
      </button>

      {isSuccess && <p className="mt-2 text-xs font-medium text-emerald-700">Binding recorded.</p>}
    </section>
  );
}

// ── Cedant half: pay the gross premium through the distributor ──────────────

function PayPremium({ portfolios }: { portfolios: PortfolioView[] }) {
  const addresses = useAddresses();
  const { address } = useAccount();
  const distributor = addresses.premiumDistributor as `0x${string}`;

  const [portfolioId, setPortfolioId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const paidFor = useRef<string | null>(null);

  const chosen = portfolioId || portfolios[0]?.portfolioId.toString() || '';
  const selected = portfolios.find((p) => p.portfolioId.toString() === chosen);
  const gross = parseUSDC(amount);

  const { data: boundRaw } = useReadContract({
    address: distributor,
    abi: PREMIUM_DISTRIBUTOR_ABI,
    functionName: 'portfolioVault',
    args: chosen ? [BigInt(chosen)] : undefined,
    query: { enabled: Boolean(chosen) },
  });
  const boundVault = typeof boundRaw === 'string' ? boundRaw : ZERO;
  const notBound = boundVault === ZERO;

  // The split comes from the contract. Reimplementing its rounding here would
  // eventually disagree with it, and this number is what people act on.
  const { data: splitRaw } = useReadContract({
    address: distributor,
    abi: PREMIUM_DISTRIBUTOR_ABI,
    functionName: 'previewSplit',
    args: gross > 0n ? [gross] : undefined,
    query: { enabled: gross > 0n },
  });
  const split = Array.isArray(splitRaw) ? (splitRaw as readonly bigint[]) : undefined;

  const { data: balanceRaw } = useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: addresses.mockUSDC,
    abi: MOCK_USDC_ABI,
    functionName: 'allowance',
    args: address ? [address, distributor] : undefined,
    query: { enabled: !!address },
  });

  const balance = typeof balanceRaw === 'bigint' ? balanceRaw : 0n;
  const allowance = typeof allowanceRaw === 'bigint' ? allowanceRaw : 0n;
  const needsApproval = gross > 0n && allowance < gross;
  const notEnough = gross > 0n && gross > balance;

  const {
    writeContract: approveWrite,
    data: approveHash,
    isPending: approvePending,
    error: approveError,
  } = useWriteContract();
  const {
    writeContract: payWrite,
    data: payHash,
    isPending: payPending,
    error: payError,
  } = useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: paySuccess } = useWaitForTransactionReceipt({ hash: payHash });

  // Same one-action pattern as funding a policy: the approval is plumbing, not
  // a decision, so the interface carries it rather than asking twice.
  useEffect(() => {
    if (!approveSuccess || !approveHash || !chosen || gross <= 0n) return;
    if (paidFor.current === approveHash) return;
    paidFor.current = approveHash;
    void refetchAllowance();
    payWrite({
      address: distributor,
      abi: PREMIUM_DISTRIBUTOR_ABI,
      functionName: 'receivePremium',
      args: [BigInt(chosen), gross],
    });
  }, [approveSuccess, approveHash, chosen, gross, distributor, payWrite, refetchAllowance]);

  const busy = approvePending || payPending;
  const error = payError ?? approveError;
  const disabled = busy || !chosen || gross <= 0n || notEnough || notBound;

  function pay() {
    if (disabled) return;
    if (needsApproval) {
      paidFor.current = null;
      approveWrite({
        address: addresses.mockUSDC,
        abi: MOCK_USDC_ABI,
        functionName: 'approve',
        args: [distributor, gross],
      });
      return;
    }
    payWrite({
      address: distributor,
      abi: PREMIUM_DISTRIBUTOR_ABI,
      functionName: 'receivePremium',
      args: [BigInt(chosen), gross],
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-gray-900">Pay a ceded premium</h3>
      <p className="mt-0.5 max-w-2xl text-xs leading-5 text-gray-500">
        The gross premium is split by the distributor before any of it reaches the vault. The LP
        quota enters as unearned premium and is recognised over the coverage period.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Portfolio
          </span>
          <select
            value={chosen}
            onChange={(e) => setPortfolioId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            {portfolios.map((p) => (
              <option key={p.portfolioId.toString()} value={p.portfolioId.toString()}>
                #{p.portfolioId.toString()} · {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Gross premium (USDC)
          </span>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="0.000001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 50000"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            {selected && selected.cededPremium > 0n && (
              <button
                type="button"
                onClick={() => setAmount((Number(selected.cededPremium) / 1e6).toString())}
                className="shrink-0 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Ceded
              </button>
            )}
          </div>
        </label>
      </div>

      {notBound && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          This portfolio is not bound to a vault yet, so the payment would revert with{' '}
          <code>VaultNotSet</code>. The curator binds it first.
        </p>
      )}

      {split && gross > 0n && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs">
          <p className="mb-2 font-semibold text-gray-700">
            How {formatUSDC(gross)} would be split — read from the contract, not estimated
          </p>
          <dl className="space-y-1">
            <Row label="To the vault (LP quota, enters UPR)" value={split[0]} strong />
            <Row label="Protocol fee" value={split[1]} />
            <Row label="Underwriting fee" value={split[2]} />
          </dl>
          <p className="mt-2 text-gray-400">
            Fees round up and any dust shrinks the LP quota, so the payer never gains from rounding.
          </p>
        </div>
      )}

      <p className="mt-3 text-xs text-gray-500">
        Your USDC balance: <strong className="font-mono">{formatUSDC(balance)}</strong>
        {needsApproval && ' · an approval is requested first, then the payment follows on its own'}
      </p>
      {notEnough && <p className="mt-1 text-xs text-red-600">More than your USDC balance.</p>}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error.message.slice(0, 180)}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={disabled}
        className="mt-4 rounded-full px-5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: '#1B3A6B' }}
      >
        {approvePending
          ? 'Approving USDC…'
          : payPending
            ? 'Paying premium…'
            : gross <= 0n
              ? 'Enter an amount'
              : `Pay ${formatUSDC(gross)}`}
      </button>

      {paySuccess && (
        <p className="mt-2 text-xs font-medium text-emerald-700">
          Premium received and split. The LP quota is now unearned premium in the vault.
        </p>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value?: bigint; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-gray-600">{label}</dt>
      <dd className={strong ? 'font-mono-num font-semibold text-gray-900' : 'font-mono-num text-gray-700'}>
        {formatUSDC(value ?? 0n)}
      </dd>
    </div>
  );
}
