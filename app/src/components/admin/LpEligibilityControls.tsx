'use client';

import { useState } from 'react';
import { useSetWhitelist, useSetKycExpiry } from '@/hooks/useComplianceAdmin';
import { useWhitelistStatuses, eligibilityLabel } from '@/hooks/useWhitelistStatuses';

/**
 * Institutional LP eligibility, presented alongside the operational roles.
 *
 * An operator looking for "Institutional LP" goes to the role list — that is
 * where the other two participants live, so it is where the third is expected.
 * Finding no such entry, they pick a neighbouring role and grant something
 * unrelated, which is exactly what happened: an LP wallet ended up with
 * ALLOCATOR_ROLE and was still unable to deposit.
 *
 * So the option belongs in that list. What it must not do is pretend to be a
 * role. There is no LP role: eligibility is `ComplianceRegistry.canReceive`,
 * and the vault consults it on every share movement, including transfers that
 * never touch this app. Granting a role would change nothing.
 *
 * Two writes stand behind it, in this order, because canReceive is an AND:
 *
 *     canReceive = !blocked && whitelisted && kycExpiry >= now
 *
 * An unset expiry reads as 0, and 0 is always in the past — which is why
 * whitelisting on its own leaves the applicant exactly where they started.
 */

/** Sentinel key: not a role id, and deliberately not in GRANTABLE_ROLES. */
export const LP_ELIGIBILITY_KEY = 'INSTITUTIONAL_LP';

const YEAR_SECONDS = 365 * 86_400;

export function LpEligibilityControls({
  account,
  isValidAccount,
}: {
  account: string;
  isValidAccount: boolean;
}) {
  const statuses = useWhitelistStatuses(isValidAccount ? [account] : []);
  const whitelist = useSetWhitelist(() => statuses.refetch());
  const kyc = useSetKycExpiry(() => statuses.refetch());
  const [touched, setTouched] = useState<'whitelist' | 'kyc' | null>(null);

  if (!isValidAccount) {
    return <p className="text-xs text-gray-500">Enter a wallet address to check its eligibility.</p>;
  }

  const e = statuses.get(account);
  const busy = whitelist.isPending || whitelist.isConfirming || kyc.isPending || kyc.isConfirming;
  const operator = whitelist.callerIsOperator;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Eligible to hold nbUSDC. Not a protocol role — the vault reads{' '}
        <code>canReceive</code> before minting a share, and on every transfer afterwards.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {e === undefined ? (
          <Chip text="Eligibility: …" bg="#F3F4F6" color="#4B5563" />
        ) : (
          <>
            <Chip
              text={e.canReceive ? 'Eligible ✓' : eligibilityLabel(e.reason)}
              bg={e.canReceive ? '#F0FDF4' : '#FFF7ED'}
              color={e.canReceive ? '#166534' : '#C2410C'}
            />
            <Chip
              text={`whitelisted: ${e.whitelisted ? 'yes' : 'no'}`}
              bg="#F3F4F6"
              color="#4B5563"
            />
            <Chip
              text={
                e.kycExpiry === 0n
                  ? 'KYC expiry: not set'
                  : `KYC expiry: ${new Date(Number(e.kycExpiry) * 1000).toLocaleDateString()}`
              }
              bg="#F3F4F6"
              color="#4B5563"
            />
          </>
        )}
      </div>

      {!operator && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          The connected wallet does not hold <code>KYC_OPERATOR_ROLE</code>, which the registry
          requires for both writes. Grant it that role first — <code>OWNER_ROLE</code> administers
          it, so an owner can grant it to itself.
        </p>
      )}

      {e?.canReceive ? (
        <p className="text-xs font-semibold text-emerald-700">
          Already eligible — no action needed.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!operator || busy || e?.whitelisted === true}
            onClick={() => {
              setTouched('whitelist');
              whitelist.setWhitelist(account as `0x${string}`, true);
            }}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {e?.whitelisted ? '1. Whitelisted ✓' : '1. Add to whitelist'}
          </button>

          <button
            type="button"
            disabled={!operator || busy || e?.whitelisted !== true}
            onClick={() => {
              setTouched('kyc');
              // Computed at press time: the clock is not a render input.
              kyc.setKycExpiry(
                account as `0x${string}`,
                BigInt(Math.floor(Date.now() / 1000) + YEAR_SECONDS),
              );
            }}
            title={e?.whitelisted !== true ? 'Whitelist first — the registry checks both' : undefined}
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400"
          >
            2. Set KYC expiry (1 year)
          </button>
        </div>
      )}

      {touched === 'whitelist' && whitelist.error && (
        <p className="text-xs text-red-700">{whitelist.error}</p>
      )}
      {touched === 'kyc' && kyc.error && <p className="text-xs text-red-700">{kyc.error}</p>}
    </div>
  );
}

function Chip({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: bg, color }}>
      {text}
    </span>
  );
}
