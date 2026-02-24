import { USDC_DECIMALS, SECONDS_PER_DAY, BASIS_POINTS } from '@/config/constants';

/**
 * Format a raw USDC bigint (6 decimals) to a display string like "$1,234.56".
 */
export function formatUSDC(amount: bigint): string {
  const divisor = 10n ** BigInt(USDC_DECIMALS);
  const whole = amount / divisor;
  const fractional = amount % divisor;
  const sign = amount < 0n ? '-' : '';
  const absWhole = whole < 0n ? -whole : whole;
  const absFractional = fractional < 0n ? -fractional : fractional;

  const wholeStr = absWhole.toLocaleString('en-US');
  const fracStr = absFractional.toString().padStart(USDC_DECIMALS, '0').slice(0, 2);

  return `${sign}$${wholeStr}.${fracStr}`;
}

/**
 * Format a raw USDC bigint (6 decimals) to a compact number like "$1.2K" or "$50K".
 */
export function formatUSDCCompact(amount: bigint): string {
  const num = Number(amount) / 1e6;
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1)}K`;
  }
  return `$${num.toFixed(2)}`;
}

/**
 * Format raw USDC amount as a plain number string (no $ sign).
 */
export function formatUSDCRaw(amount: bigint): string {
  const num = Number(amount) / 1e6;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Derive share price from totalAssets and totalSupply.
 * Returns formatted string like "$1.0199".
 * Handles the 18-decimal share token vs 6-decimal USDC.
 */
export function formatSharePrice(totalAssets: bigint, totalSupply: bigint): string {
  if (totalSupply === 0n) return '$1.0000';

  // totalAssets is USDC raw (6 decimals), totalSupply is shares (18 decimals)
  // With _decimalsOffset=12: price in dollars = (assets / 1e6) / (shares / 1e18)
  //   = assets * 1e12 / shares
  const priceNum = Number(totalAssets * 10n ** 12n) / Number(totalSupply);
  return `$${priceNum.toFixed(4)}`;
}

/**
 * Get share price as a number.
 */
export function getSharePriceNumber(totalAssets: bigint, totalSupply: bigint): number {
  if (totalSupply === 0n) return 1.0;
  // totalAssets is USDC raw (6 dec), totalSupply is shares (18 dec)
  // Price in dollars = (assets / 1e6) / (shares / 1e18) = assets * 1e12 / shares
  return Number(totalAssets * 10n ** 12n) / Number(totalSupply);
}

/**
 * Format a management fee BPS value to APY string like "0.50%".
 */
export function formatFeeBps(feeBps: bigint | number): string {
  const bps = Number(feeBps);
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * Format a projected APY based on premium rate and management fee.
 * For display purposes.
 */
export function formatAPY(premiumRatePercent: number): string {
  return `${premiumRatePercent.toFixed(1)}%`;
}

/**
 * Format remaining days from timestamps.
 */
export function formatDaysRemaining(endTime: bigint, currentTime: bigint): string {
  if (currentTime >= endTime) return 'Expired';
  const remainingSeconds = Number(endTime - currentTime);
  const days = Math.ceil(remainingSeconds / SECONDS_PER_DAY);
  if (days === 1) return '1 day';
  return `${days} days`;
}

/**
 * Format seconds to a human-readable duration.
 */
export function formatDuration(seconds: bigint | number): string {
  const secs = Number(seconds);
  const days = Math.floor(secs / SECONDS_PER_DAY);
  if (days === 0) return '< 1 day';
  if (days === 1) return '1 day';
  return `${days} days`;
}

/**
 * Format a buffer ratio from BPS to percentage.
 */
export function formatBufferRatio(bufferBps: bigint | number): string {
  const pct = (Number(bufferBps) / Number(BASIS_POINTS)) * 100;
  return `${pct.toFixed(0)}%`;
}

/**
 * Format an allocation weight from BPS to percentage.
 */
export function formatAllocationWeight(weightBps: bigint | number): string {
  const pct = (Number(weightBps) / Number(BASIS_POINTS)) * 100;
  return `${pct.toFixed(0)}%`;
}

/**
 * Format a BTC price from int256 (8 decimals) to display string.
 */
export function formatBtcPrice(price: bigint): string {
  const priceNum = Number(price) / 1e8;
  return `$${priceNum.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Format an address to a shortened version.
 */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Parse a USDC amount string to raw bigint (6 decimals).
 */
export function parseUSDC(amount: string): bigint {
  const cleaned = amount.replace(/[,$\s]/g, '');
  if (!cleaned || isNaN(Number(cleaned))) return 0n;

  const parts = cleaned.split('.');
  const whole = parts[0] || '0';
  const fractional = (parts[1] || '').padEnd(USDC_DECIMALS, '0').slice(0, USDC_DECIMALS);

  return BigInt(whole) * 10n ** BigInt(USDC_DECIMALS) + BigInt(fractional);
}

/**
 * Calculate the progress of a policy as a percentage (0-100).
 */
export function calculatePolicyProgress(
  startTime: bigint,
  duration: bigint,
  currentTime: bigint,
): number {
  if (duration === 0n) return 100;
  const elapsed = currentTime > startTime ? currentTime - startTime : 0n;
  if (elapsed >= duration) return 100;
  return Number((elapsed * 100n) / duration);
}
