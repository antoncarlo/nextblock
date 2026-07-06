// Shared helpers for the protocol subgraph mappings.
//
// Every handler does two things: update its aggregate entity, and append one
// immutable ProtocolEvent row — the cross-module activity feed the UI and the
// settlement reports read chronologically.

import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { ProtocolEvent } from "../generated/schema";

export function eventId(event: ethereum.Event): string {
  return event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
}

export class LogParams {
  vault: Bytes | null = null;
  portfolioId: BigInt | null = null;
  claimId: BigInt | null = null;
  actor: Bytes | null = null;
  amount: BigInt | null = null;
}

export function logEvent(
  event: ethereum.Event,
  contract: string,
  name: string,
  params: LogParams,
): void {
  const e = new ProtocolEvent(eventId(event));
  e.contract = contract;
  e.name = name;
  e.vault = params.vault;
  e.portfolioId = params.portfolioId;
  e.claimId = params.claimId;
  e.actor = params.actor;
  e.amount = params.amount;
  e.timestamp = event.block.timestamp;
  e.blockNumber = event.block.number;
  e.txHash = event.transaction.hash;
  e.save();
}
