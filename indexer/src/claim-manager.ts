// ClaimManager mappings: the claim lifecycle state machine.
// SUBMITTED → ASSESSED → (DISPUTED/FROZEN) → APPROVED/REJECTED → PAID.

import { BigInt } from "@graphprotocol/graph-ts";
import {
  ClaimSubmitted,
  ClaimAssessed,
  ClaimAnomalyFlagged,
  ClaimDisputed,
  ClaimDisputeResolved,
  ClaimFrozen,
  ClaimUnfrozen,
  ClaimApproved,
  ClaimRejected,
  ClaimPaid,
} from "../generated/ClaimManager/ClaimManager";
import { Claim } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

function touch(id: BigInt, ts: BigInt): Claim | null {
  const c = Claim.load(id.toString());
  if (c != null) c.updatedAt = ts;
  return c;
}

export function handleClaimSubmitted(event: ClaimSubmitted): void {
  const c = new Claim(event.params.claimId.toString());
  c.portfolioId = event.params.portfolioId;
  c.vault = event.params.vault;
  c.claimant = event.params.claimant;
  c.requestedAmount = event.params.requestedAmount;
  c.claimType = event.params.claimType;
  c.evidenceHash = event.params.evidenceHash;
  c.challengeDeadline = event.params.challengeDeadline;
  c.status = "SUBMITTED";
  c.recommendation = 0;
  c.scoreBps = 0;
  c.anomalyScoreBps = 0;
  c.anomalyFlagged = false;
  c.disputeUpheld = false;
  c.reserved = BigInt.zero();
  c.submittedAt = event.block.timestamp;
  c.updatedAt = event.block.timestamp;
  c.save();

  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.portfolioId = event.params.portfolioId;
  p.vault = event.params.vault;
  p.actor = event.params.claimant;
  p.amount = event.params.requestedAmount;
  logEvent(event, "ClaimManager", "ClaimSubmitted", p);
}

export function handleClaimAssessed(event: ClaimAssessed): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "ASSESSED";
    c.recommendation = event.params.recommendation;
    c.scoreBps = event.params.scoreBps;
    c.anomalyScoreBps = event.params.anomalyScoreBps;
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  logEvent(event, "ClaimManager", "ClaimAssessed", p);
}

export function handleClaimAnomalyFlagged(event: ClaimAnomalyFlagged): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.anomalyFlagged = true;
    c.anomalyScoreBps = event.params.anomalyScoreBps;
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  logEvent(event, "ClaimManager", "ClaimAnomalyFlagged", p);
}

export function handleClaimDisputed(event: ClaimDisputed): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "DISPUTED";
    c.disputeReason = event.params.reason;
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.sentinel;
  logEvent(event, "ClaimManager", "ClaimDisputed", p);
}

export function handleClaimDisputeResolved(event: ClaimDisputeResolved): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.disputeUpheld = event.params.upheld;
    // An upheld dispute sends the claim back to committee judgement; a
    // dismissed one returns it to the assessed track.
    c.status = event.params.upheld ? "REJECTED" : "ASSESSED";
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.committee;
  logEvent(event, "ClaimManager", "ClaimDisputeResolved", p);
}

export function handleClaimFrozen(event: ClaimFrozen): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "FROZEN";
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.sentinel;
  logEvent(event, "ClaimManager", "ClaimFrozen", p);
}

export function handleClaimUnfrozen(event: ClaimUnfrozen): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "ASSESSED";
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.sentinel;
  logEvent(event, "ClaimManager", "ClaimUnfrozen", p);
}

export function handleClaimApproved(event: ClaimApproved): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "APPROVED";
    c.approvedAmount = event.params.approvedAmount;
    c.receiptId = event.params.receiptId;
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.committee;
  p.amount = event.params.approvedAmount;
  logEvent(event, "ClaimManager", "ClaimApproved", p);
}

export function handleClaimRejected(event: ClaimRejected): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "REJECTED";
    c.disputeReason = event.params.reason;
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.committee;
  logEvent(event, "ClaimManager", "ClaimRejected", p);
}

export function handleClaimPaid(event: ClaimPaid): void {
  const c = touch(event.params.claimId, event.block.timestamp);
  if (c != null) {
    c.status = "PAID";
    c.paidAmount = event.params.amount;
    c.paidTo = event.params.to;
    c.receiptId = event.params.receiptId;
    c.save();
  }
  const p = new LogParams();
  p.claimId = event.params.claimId;
  p.actor = event.params.to;
  p.amount = event.params.amount;
  logEvent(event, "ClaimManager", "ClaimPaid", p);
}
