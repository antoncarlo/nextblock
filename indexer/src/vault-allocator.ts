// VaultAllocator mappings: allocation proposal lifecycle.
// PROPOSED → EXECUTED / CANCELLED / EXPIRED.

import { BigInt } from "@graphprotocol/graph-ts";
import {
  AllocationProposed,
  AllocationExecuted,
  AllocationCancelled,
  AllocationExpired,
} from "../generated/VaultAllocator/VaultAllocator";
import { AllocationProposal } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

function resolve(id: BigInt, status: string, ts: BigInt): AllocationProposal | null {
  const pr = AllocationProposal.load(id.toString());
  if (pr != null) {
    pr.status = status;
    pr.resolvedAt = ts;
  }
  return pr;
}

export function handleAllocationProposed(event: AllocationProposed): void {
  const pr = new AllocationProposal(event.params.proposalId.toString());
  pr.vault = event.params.vault;
  pr.portfolioId = event.params.portfolioId;
  pr.amount = event.params.amount;
  pr.isDeallocation = event.params.isDeallocation;
  pr.proposer = event.params.proposer;
  pr.expiresAt = event.params.expiresAt;
  pr.status = "PROPOSED";
  pr.proposedAt = event.block.timestamp;
  pr.save();

  const p = new LogParams();
  p.vault = event.params.vault;
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.proposer;
  p.amount = event.params.amount;
  logEvent(event, "VaultAllocator", "AllocationProposed", p);
}

export function handleAllocationExecuted(event: AllocationExecuted): void {
  const pr = resolve(event.params.proposalId, "EXECUTED", event.block.timestamp);
  if (pr != null) {
    pr.executor = event.params.executor;
    pr.save();
  }
  const p = new LogParams();
  p.actor = event.params.executor;
  logEvent(event, "VaultAllocator", "AllocationExecuted", p);
}

export function handleAllocationCancelled(event: AllocationCancelled): void {
  const pr = resolve(event.params.proposalId, "CANCELLED", event.block.timestamp);
  if (pr != null) pr.save();
  const p = new LogParams();
  p.actor = event.params.by;
  logEvent(event, "VaultAllocator", "AllocationCancelled", p);
}

export function handleAllocationExpired(event: AllocationExpired): void {
  const pr = resolve(event.params.proposalId, "EXPIRED", event.block.timestamp);
  if (pr != null) pr.save();
  const p = new LogParams();
  logEvent(event, "VaultAllocator", "AllocationExpired", p);
}
