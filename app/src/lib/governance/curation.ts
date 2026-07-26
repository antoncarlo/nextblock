import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
// Extension-qualified so the smoke script can run the module directly under
// node --experimental-strip-types, as the other pure libs in this repo do.
import { buildRawOperation, type TimelockOperation } from './timelock.ts';

/**
 * Encoding for taking an unassigned vault into curation.
 *
 * `InsuranceVault.assignSyndicate` is OWNER_ROLE-gated, so a syndicate cannot
 * appoint itself — and the interface does not pretend otherwise. What it can do
 * is produce the exact operation the owner has to run, so the request travels as
 * verifiable calldata instead of a message asking someone to type an address.
 *
 * The call is deliberately one-way on-chain: it writes only while the vault has
 * no syndicate. That property lives in the contract, not here; this module is
 * pure encoding and holds no authority.
 */

const ASSIGN_SYNDICATE_ABI = [
  {
    type: 'function',
    name: 'assignSyndicate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'syndicate', type: 'address' }],
    outputs: [],
  },
] as const;

export interface CurationRequest {
  /** The vault to be taken into curation. */
  vault: Address;
  /** The syndicate that would curate it. */
  syndicate: Address;
  /** Human label, also the deterministic timelock salt seed. */
  label: string;
  /** Encoded assignSyndicate(syndicate). */
  data: Hex;
}

/** Label is deterministic: the same request always hashes to the same salt. */
export function curationLabel(vault: Address, syndicate: Address): string {
  return `assign-syndicate:${vault.toLowerCase()}:${syndicate.toLowerCase()}`;
}

export function buildCurationRequest(vault: Address, syndicate: Address): CurationRequest {
  // Checksummed on the way out: the consumer of this request is an address
  // field that rejects a mismatched EIP-55 checksum, so emitting a raw
  // lower-case address would hand the owner an input they cannot submit.
  const v = getAddress(vault);
  const s = getAddress(syndicate);
  return {
    vault: v,
    syndicate: s,
    label: curationLabel(v, s),
    data: encodeFunctionData({ abi: ASSIGN_SYNDICATE_ABI, functionName: 'assignSyndicate', args: [s] }),
  };
}

/** The same request as a timelock operation, ready for the governance console. */
export function buildCurationOperation(vault: Address, syndicate: Address): TimelockOperation {
  const req = buildCurationRequest(vault, syndicate);
  return buildRawOperation(req.label, req.vault, req.data);
}

/**
 * Deep link into the governance console with the operation pre-filled. The
 * owner still reviews, schedules and executes it through the Safe — the link
 * only saves retyping calldata, which is where mistakes come from.
 */
export function curationConsoleHref(vault: Address, syndicate: Address): string {
  const req = buildCurationRequest(vault, syndicate);
  const params = new URLSearchParams({
    kind: 'raw',
    label: req.label,
    target: req.vault,
    data: req.data,
  });
  return `/app/admin/governance?${params.toString()}`;
}
