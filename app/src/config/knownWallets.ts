/**
 * Known wallet addresses mapped to display names.
 * Used to personalise the welcome message in the dApp.
 */
export const KNOWN_WALLET_NAMES: Record<string, string> = {
  // Anton Carlo Santoro — NextBlock admin & founder
  '0x810fa6726eeb6014c2f77bb4802a5734c28b0f3e': 'Anton Carlo Santoro',
  // Co-Admin — full access (Admin + Insurance Co. + Syndicate Manager)
  '0x3630082d96065b756e84b8b79e030a525b9583ed': 'NextBlock Admin',
};

/**
 * Returns the display name for a wallet address, or null if unknown.
 */
export function getWalletName(address: string | undefined): string | null {
  if (!address) return null;
  return KNOWN_WALLET_NAMES[address.toLowerCase()] ?? null;
}
