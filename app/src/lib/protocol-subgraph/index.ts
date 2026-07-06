/**
 * Typed SDK for the nextblock-protocol subgraph.
 *
 *   import { queryProtocolSubgraph, VAULTS_QUERY, parseVaults } from '@/lib/protocol-subgraph';
 *
 * Client (freshness-aware) + queries + pure parsers. The legacy redemption
 * client stays in lib/subgraph.ts until the redemption UI migrates.
 */

export * from './client';
export * from './queries';
export * from './entities';
