// NextBlock RedemptionQueue subgraph mappings (AssemblyScript / graph-ts).
//
// Builds the LP exit history: per-epoch settlement, individual requests/claims,
// per-LP positions and a global rollup. All counters are accumulated additively
// so the read model reconciles with the on-chain ledger.

import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  RedemptionRequested,
  EpochSettled,
  RedemptionClaimed,
  PausedSet,
} from "../generated/RedemptionQueue/RedemptionQueue";
import { Epoch, RedemptionRequest, RedemptionClaim, LpPosition, ProtocolStat } from "../generated/schema";

const GLOBAL = "global";

function stat(): ProtocolStat {
  let s = ProtocolStat.load(GLOBAL);
  if (s == null) {
    s = new ProtocolStat(GLOBAL);
    s.totalSharesRequested = BigInt.zero();
    s.totalSettledShares = BigInt.zero();
    s.totalSettledAssets = BigInt.zero();
    s.totalAssetsClaimed = BigInt.zero();
    s.epochsSettled = 0;
    s.paused = false;
  }
  return s as ProtocolStat;
}

function epochOf(epochId: BigInt, block: BigInt): Epoch {
  let e = Epoch.load(epochId.toString());
  if (e == null) {
    e = new Epoch(epochId.toString());
    e.epochId = epochId;
    e.totalSharesRequested = BigInt.zero();
    e.settledShares = BigInt.zero();
    e.settledAssets = BigInt.zero();
    e.ratioBps = BigInt.zero();
    e.settled = false;
    e.requestCount = 0;
    e.openedAtBlock = block;
  }
  return e as Epoch;
}

function lpOf(addr: Bytes): LpPosition {
  let lp = LpPosition.load(addr.toHexString());
  if (lp == null) {
    lp = new LpPosition(addr.toHexString());
    lp.totalSharesRequested = BigInt.zero();
    lp.totalAssetsClaimed = BigInt.zero();
    lp.totalSharesReturned = BigInt.zero();
    lp.requestCount = 0;
    lp.claimCount = 0;
  }
  return lp as LpPosition;
}

export function handleRedemptionRequested(ev: RedemptionRequested): void {
  const e = epochOf(ev.params.epochId, ev.block.number);
  e.totalSharesRequested = e.totalSharesRequested.plus(ev.params.shares);
  e.requestCount = e.requestCount + 1;
  e.save();

  const lp = lpOf(ev.params.lp);
  lp.totalSharesRequested = lp.totalSharesRequested.plus(ev.params.shares);
  lp.requestCount = lp.requestCount + 1;
  lp.save();

  const id = ev.transaction.hash.toHexString() + "-" + ev.logIndex.toString();
  const r = new RedemptionRequest(id);
  r.epoch = e.id;
  r.lp = lp.id;
  r.shares = ev.params.shares;
  r.blockNumber = ev.block.number;
  r.timestamp = ev.block.timestamp;
  r.txHash = ev.transaction.hash;
  r.save();

  const s = stat();
  s.totalSharesRequested = s.totalSharesRequested.plus(ev.params.shares);
  s.save();
}

export function handleEpochSettled(ev: EpochSettled): void {
  const e = epochOf(ev.params.epochId, ev.block.number);
  e.settledShares = ev.params.settledShares;
  e.settledAssets = ev.params.settledAssets;
  e.ratioBps = ev.params.ratioBps;
  e.settled = true;
  e.settledAt = ev.block.timestamp;
  e.save();

  const s = stat();
  s.totalSettledShares = s.totalSettledShares.plus(ev.params.settledShares);
  s.totalSettledAssets = s.totalSettledAssets.plus(ev.params.settledAssets);
  s.epochsSettled = s.epochsSettled + 1;
  s.save();
}

export function handleRedemptionClaimed(ev: RedemptionClaimed): void {
  const e = epochOf(ev.params.epochId, ev.block.number);

  const lp = lpOf(ev.params.lp);
  lp.totalAssetsClaimed = lp.totalAssetsClaimed.plus(ev.params.assetsPaid);
  lp.totalSharesReturned = lp.totalSharesReturned.plus(ev.params.sharesReturned);
  lp.claimCount = lp.claimCount + 1;
  lp.save();

  const id = ev.transaction.hash.toHexString() + "-" + ev.logIndex.toString();
  const c = new RedemptionClaim(id);
  c.epoch = e.id;
  c.lp = lp.id;
  c.assetsPaid = ev.params.assetsPaid;
  c.sharesReturned = ev.params.sharesReturned;
  c.blockNumber = ev.block.number;
  c.timestamp = ev.block.timestamp;
  c.txHash = ev.transaction.hash;
  c.save();

  const s = stat();
  s.totalAssetsClaimed = s.totalAssetsClaimed.plus(ev.params.assetsPaid);
  s.save();
}

export function handlePausedSet(ev: PausedSet): void {
  const s = stat();
  s.paused = ev.params.paused;
  s.save();
}
