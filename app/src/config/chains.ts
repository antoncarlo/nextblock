import { baseSepolia as baseSepoliaChain } from "viem/chains";

export const baseSepolia = baseSepoliaChain;

/**
 * Supported chains. The protocol is Base only: Base Sepolia (84532) is the staging
 * network with the deployed stack (deployments/84532-staging.json). There is no
 * mainnet deployment yet, so none is offered.
 */
export const supportedChains = [baseSepoliaChain] as const;

/**
 * Default chain used when no wallet is connected.
 */
export const defaultChain = baseSepoliaChain;
