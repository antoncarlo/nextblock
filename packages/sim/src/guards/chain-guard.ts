/**
 * Refuses to run anywhere the simulation could do harm.
 *
 * This harness exists to send thousands of adversarial transactions, many of
 * them designed to fail and some designed to move money in ways nobody would
 * approve. On a testnet that is the point. On mainnet it is an incident.
 *
 * The check is an allowlist rather than a mainnet blocklist. A blocklist has
 * to be updated every time a chain is added and is wrong by default until
 * somebody remembers; an allowlist is wrong by default in the safe direction.
 */

/** Base Sepolia. The only chain this harness may write to. */
export const BASE_SEPOLIA = 84_532;
/** Local Anvil, for development. */
export const ANVIL = 31_337;

const PERMITTED = new Set<number>([BASE_SEPOLIA, ANVIL]);

/** Chain ids named here produce a distinct message, because the mistake is worse. */
const PRODUCTION_CHAINS: Record<number, string> = {
  1: 'Ethereum mainnet',
  8453: 'Base mainnet',
  10: 'OP mainnet',
  42161: 'Arbitrum One',
  137: 'Polygon',
};

export class ChainGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainGuardError';
  }
}

/**
 * Throws unless `chainId` is one the harness may write to.
 *
 * Call before the first transaction of a run, not before each one: a check
 * that runs a thousand times is a check somebody eventually makes optional for
 * speed.
 */
export function assertWritableChain(chainId: number): void {
  if (PERMITTED.has(chainId)) return;

  const named = PRODUCTION_CHAINS[chainId];
  if (named) {
    throw new ChainGuardError(
      `Refusing to run the agent simulation against ${named} (chain ${chainId}). ` +
        `This harness sends adversarial transactions by design, including some intended to fail ` +
        `and some that move funds. It may only write to Base Sepolia (${BASE_SEPOLIA}) or a local ` +
        `Anvil (${ANVIL}).`,
    );
  }

  throw new ChainGuardError(
    `Refusing to run the agent simulation against chain ${chainId}: not on the permitted list ` +
      `(Base Sepolia ${BASE_SEPOLIA}, Anvil ${ANVIL}). If this chain is genuinely a test network, ` +
      `add it deliberately rather than widening the check.`,
  );
}

/**
 * Confirms the RPC endpoint agrees with the chain id it was configured for.
 *
 * A URL and a chain id are two separate pieces of configuration, and nothing
 * stops them disagreeing. Asking the node which chain it is on is the only way
 * to know that the allowlist was applied to the chain actually being written
 * to — otherwise the guard checks a number in a config file while the
 * transactions go somewhere else entirely.
 */
export async function assertEndpointMatches(
  client: { getChainId(): Promise<number> },
  expectedChainId: number,
): Promise<void> {
  const actual = await client.getChainId();
  if (actual !== expectedChainId) {
    throw new ChainGuardError(
      `The RPC endpoint reports chain ${actual} but the run is configured for ${expectedChainId}. ` +
        `Refusing to continue: the chain guard would have been applied to the configured value ` +
        `while the transactions went to the reported one.`,
    );
  }
  assertWritableChain(actual);
}
