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
 * Supported chains for the app.
 */
export const supportedChains = [baseSepoliaChain, sepoliaChain, arcTestnet] as const;

/**
 * Default chain used when no wallet is connected.
 */
export const defaultChain = baseSepoliaChain;
