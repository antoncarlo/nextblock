/**
 * Audit-trail decoder smoke (Claims sub-project 4).
 *
 *   node --experimental-strip-types app/scripts/audit-decode-smoke.ts
 *
 * Scope: encode known event payloads with viem, decode them through the
 * audit decoder, and check the normalized AuditRecord shape. No network.
 */

import { encodeEventTopics, encodeAbiParameters, type Log } from 'viem';
import {
  CLAIM_MANAGER_EVENT_ABI,
  CLAIM_RECEIPT_EVENT_ABI,
} from '../src/lib/audit/abi.ts';
import {
  decodeClaimManagerLog,
  decodeClaimReceiptLog,
  buildReceiptLink,
} from '../src/lib/audit/decode.ts';

let failures = 0;
function check(name: string, condition: boolean) {
  if (condition) console.log(`PASS ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}`);
  }
}

const CLAIM_MANAGER = '0xaa00000000000000000000000000000000000001' as const;
const CLAIM_RECEIPT = '0xbb00000000000000000000000000000000000002' as const;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

function makeLog(args: {
  address: `0x${string}`;
  topics: ReadonlyArray<`0x${string}` | `0x${string}`[] | null>;
  data: `0x${string}`;
  blockNumber?: bigint;
  logIndex?: number;
  txHash?: `0x${string}`;
}): Log {
  // viem's encodeEventTopics can return `Hex | Hex[] | null` per topic. The
  // smoke tests only emit single-hex topics (no anonymous events, no array
  // topics), so we keep null-safe but cast back to the Log.topics shape.
  const topics = args.topics.filter((t): t is `0x${string}` => typeof t === 'string') as `0x${string}`[];
  return {
    address: args.address,
    topics,
    data: args.data,
    blockNumber: args.blockNumber ?? 100n,
    logIndex: args.logIndex ?? 0,
    transactionHash: args.txHash ?? (('0x' + 'a'.repeat(64)) as `0x${string}`),
    transactionIndex: 0,
    blockHash: ('0x' + 'b'.repeat(64)) as `0x${string}`,
    removed: false,
  } as Log;
}

// --- ClaimSubmitted golden vector ---
{
  const ev = CLAIM_MANAGER_EVENT_ABI.find((e) => e.name === 'ClaimSubmitted')!;
  const claimant = '0xcccccccccccccccccccccccccccccccccccccccc';
  const topics = encodeEventTopics({
    abi: [ev],
    eventName: 'ClaimSubmitted',
    args: { claimId: 42n, portfolioId: 7n, vault: '0x4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d' },
  });
  const data = encodeAbiParameters(
    [
      { type: 'address' }, // claimant
      { type: 'uint256' }, // requestedAmount
      { type: 'uint8' }, // claimType
      { type: 'bytes32' }, // evidenceHash
      { type: 'uint64' }, // challengeDeadline
    ],
    [claimant, 1_000_000n, 0, ZERO_BYTES32, 1_800_000_000n],
  );
  const log = makeLog({ address: CLAIM_MANAGER, topics, data });
  const r = decodeClaimManagerLog(log);
  check('ClaimSubmitted decoded', r !== null);
  check('ClaimSubmitted name', r?.eventName === 'ClaimSubmitted');
  check('ClaimSubmitted claimId', r?.claimId === 42n);
  check('ClaimSubmitted contractAddr lowercased', r?.contractAddr === CLAIM_MANAGER.toLowerCase());
  check('ClaimSubmitted actor = claimant (lowercase)', r?.actor === claimant.toLowerCase());
  check('ClaimSubmitted data.requestedAmount stringified', r?.data.requestedAmount === '1000000');
  check('ClaimSubmitted data.claimant lowercased', r?.data.claimant === claimant.toLowerCase());
}

// --- ClaimDisputed: actor should be sentinel (indexed) ---
{
  const ev = CLAIM_MANAGER_EVENT_ABI.find((e) => e.name === 'ClaimDisputed')!;
  const sentinel = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const topics = encodeEventTopics({
    abi: [ev],
    eventName: 'ClaimDisputed',
    args: { claimId: 99n, sentinel },
  });
  const data = encodeAbiParameters([{ type: 'string' }], ['evidence inconsistent']);
  const log = makeLog({ address: CLAIM_MANAGER, topics, data, logIndex: 5 });
  const r = decodeClaimManagerLog(log);
  check('ClaimDisputed decoded', r !== null);
  check('ClaimDisputed actor = sentinel lowercased', r?.actor === sentinel.toLowerCase());
  check('ClaimDisputed data.reason preserved', r?.data.reason === 'evidence inconsistent');
  check('ClaimDisputed logIndex preserved', r?.logIndex === 5);
}

// --- ClaimApproved: actor = committee, receiptId in data ---
{
  const ev = CLAIM_MANAGER_EVENT_ABI.find((e) => e.name === 'ClaimApproved')!;
  const committee = '0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0';
  const topics = encodeEventTopics({
    abi: [ev],
    eventName: 'ClaimApproved',
    args: { claimId: 42n, committee },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    [800_000n, 5n],
  );
  const log = makeLog({ address: CLAIM_MANAGER, topics, data });
  const r = decodeClaimManagerLog(log);
  check('ClaimApproved actor = committee', r?.actor === committee.toLowerCase());
  check('ClaimApproved data.receiptId stringified', r?.data.receiptId === '5');
}

// --- ReceiptMinted: must be linked via receiptId→claimId ---
{
  const ev = CLAIM_RECEIPT_EVENT_ABI.find((e) => e.name === 'ReceiptMinted')!;
  const insurer = '0x1111111111111111111111111111111111111111';
  const topics = encodeEventTopics({
    abi: [ev],
    eventName: 'ReceiptMinted',
    args: { receiptId: 5n, insurer },
  });
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
    [777n, 800_000n, '0x4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d'],
  );
  const log = makeLog({ address: CLAIM_RECEIPT, topics, data, blockNumber: 200n });

  const linkerKnown = buildReceiptLink([{ receiptId: 5n, claimId: 42n }]);
  const r1 = decodeClaimReceiptLog(log, linkerKnown);
  check('Receipt with known link decoded', r1 !== null);
  check('Receipt event name namespaced as ReceiptMinted', r1?.eventName === 'ReceiptMinted');
  check('Receipt claimId from link', r1?.claimId === 42n);

  const linkerUnknown = buildReceiptLink([]);
  const r2 = decodeClaimReceiptLog(log, linkerUnknown);
  check('Receipt without link is dropped (no invented claim)', r2 === null);
}

// --- Unknown event signature is dropped (forward compat) ---
{
  const log = makeLog({
    address: CLAIM_MANAGER,
    topics: ['0xdeadbeef' + '0'.repeat(56)] as `0x${string}`[],
    data: '0x',
  });
  const r = decodeClaimManagerLog(log);
  check('Unknown event topic dropped', r === null);
}

// --- Log without blockNumber is dropped (mempool snapshot) ---
{
  const ev = CLAIM_MANAGER_EVENT_ABI.find((e) => e.name === 'ClaimFrozen')!;
  const topics = encodeEventTopics({
    abi: [ev],
    eventName: 'ClaimFrozen',
    args: { claimId: 1n, sentinel: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' },
  });
  const log = makeLog({ address: CLAIM_MANAGER, topics, data: '0x' });
  // Force-null the block info so the decoder's guard fires.
  (log as { blockNumber: bigint | null }).blockNumber = null;
  const r = decodeClaimManagerLog(log);
  check('Log missing blockNumber dropped', r === null);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures > 0 ? 1 : 0);
