/**
 * Canonical risk disclosure for NextBlock vault shares.
 *
 * The vault share is a NAV-bearing reinsurance vault token — NOT a stablecoin and
 * NOT redeemable at a fixed 1:1 value. This single source of truth must be shown
 * wherever the share is presented (deposit, position, statements) so it is never
 * mistaken for "wrapped USDC" or a stable asset.
 */

/** Non-stable display symbol for the vault share. */
export const SHARE_SYMBOL = 'nbRV';

/** Full human-readable name of the vault share. */
export const SHARE_NAME = 'NextBlock Reinsurance Vault share';

/** Canonical one-line risk disclaimer (UI + docs must match this wording). */
export const SHARE_DISCLAIMER =
  'Vault share token; not a stablecoin; not legal tender; not redeemable at a fixed 1:1 value; ' +
  'subject to eligibility, vault terms, NAV, fees, claims, liquidity and risk of loss.';
