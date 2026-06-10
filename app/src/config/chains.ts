import { baseSepolia as baseSepoliaChain, sepolia as sepoliaChain } from "viem/chains";
import { defineChain } from "viem";

export const baseSepolia = baseSepoliaChain;
export const sepolia = sepoliaChain;

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
});

/**
 * Supported chains. Base Sepolia (84532) is the PRIMARY STAGING network with
 * the real institutional stack (deployments/84532-staging.json). Sepolia and
 * Arc carry only the LEGACY DEMO contracts (institutional modules ZERO -> the
 * UI shows "Unavailable" there). No mainnet target in the MVP.
 */
export const supportedChains = [baseSepoliaChain, sepoliaChain, arcTestnet] as const;

/**
 * Default chain used when no wallet is connected.
 */
export const defaultChain = baseSepoliaChain;
