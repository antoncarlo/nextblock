// BordereauOracle mappings: UMA-style assertion lifecycle.
// PROPOSED → (DISPUTED) → FINALIZED / REJECTED.

import { BigInt } from "@graphprotocol/graph-ts";
import {
  AssertionProposed,
  AssertionDisputed,
  AssertionDisputeResolved,
  AssertionFinalized,
  AssertionRejected,
} from "../generated/BordereauOracle/BordereauOracle";
import { Assertion } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

function touch(id: BigInt, ts: BigInt): Assertion | null {
  const a = Assertion.load(id.toString());
  if (a != null) a.updatedAt = ts;
  return a;
}

export function handleAssertionProposed(event: AssertionProposed): void {
  const a = new Assertion(event.params.assertionId.toString());
  a.portfolioId = event.params.portfolioId;
  a.assertionType = event.params.assertionType;
  a.dataHash = event.params.dataHash;
  a.declaredAmount = event.params.declaredAmount;
  a.proposer = event.params.proposer;
  a.livenessDeadline = event.params.livenessDeadline;
  a.status = "PROPOSED";
  a.disputeUpheld = false;
  a.proposedAt = event.block.timestamp;
  a.updatedAt = event.block.timestamp;
  a.save();

  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.proposer;
  p.amount = event.params.declaredAmount;
  logEvent(event, "BordereauOracle", "AssertionProposed", p);
}

export function handleAssertionDisputed(event: AssertionDisputed): void {
  const a = touch(event.params.assertionId, event.block.timestamp);
  if (a != null) {
    a.status = "DISPUTED";
    a.disputeReason = event.params.reason;
    a.save();
  }
  const p = new LogParams();
  p.actor = event.params.sentinel;
  logEvent(event, "BordereauOracle", "AssertionDisputed", p);
}

export function handleAssertionDisputeResolved(event: AssertionDisputeResolved): void {
  const a = touch(event.params.assertionId, event.block.timestamp);
  if (a != null) {
    a.disputeUpheld = event.params.upheld;
    a.status = event.params.upheld ? "REJECTED" : "PROPOSED";
    a.save();
  }
  const p = new LogParams();
  p.actor = event.params.committee;
  logEvent(event, "BordereauOracle", "AssertionDisputeResolved", p);
}

export function handleAssertionFinalized(event: AssertionFinalized): void {
  const a = touch(event.params.assertionId, event.block.timestamp);
  if (a != null) {
    a.status = "FINALIZED";
    a.finalizedAt = event.block.timestamp;
    a.save();
  }
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  logEvent(event, "BordereauOracle", "AssertionFinalized", p);
}

export function handleAssertionRejected(event: AssertionRejected): void {
  const a = touch(event.params.assertionId, event.block.timestamp);
  if (a != null) {
    a.status = "REJECTED";
    a.save();
  }
  const p = new LogParams();
  logEvent(event, "BordereauOracle", "AssertionRejected", p);
}
