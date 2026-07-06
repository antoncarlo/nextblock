// PortfolioRegistry mappings: the ceded-portfolio lifecycle state machine.
// SUBMITTED → IN_REVIEW → APPROVED/REJECTED → ACTIVE → PAUSED/EXPIRED.

import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  PortfolioSubmitted,
  PortfolioReviewStarted,
  PortfolioApproved,
  PortfolioRejected,
  PortfolioActivated,
  PortfolioPaused,
  PortfolioUnpaused,
  PortfolioExpired,
  PortfolioMetadataUpdated,
} from "../generated/PortfolioRegistry/PortfolioRegistry";
import { Portfolio } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

function mustLoad(id: BigInt, ts: BigInt): Portfolio {
  let pf = Portfolio.load(id.toString());
  if (pf == null) {
    // Defensive: transition seen without a submission (should not happen —
    // the registry emits Submitted first and startBlock predates the stack).
    pf = new Portfolio(id.toString());
    pf.cedant = Address.zero();
    pf.structureType = 0;
    pf.coverageLimit = BigInt.zero();
    pf.cededPremium = BigInt.zero();
    pf.inceptionTime = BigInt.zero();
    pf.expiryTime = BigInt.zero();
    pf.status = "SUBMITTED";
    pf.expectedLossBps = 0;
    pf.allocated = BigInt.zero();
    pf.premiumsReceivedGross = BigInt.zero();
    pf.submittedAt = ts;
  }
  pf.updatedAt = ts;
  return pf as Portfolio;
}

export function handlePortfolioSubmitted(event: PortfolioSubmitted): void {
  const pf = new Portfolio(event.params.portfolioId.toString());
  pf.cedant = event.params.cedant;
  pf.structureType = event.params.structureType;
  pf.coverageLimit = event.params.coverageLimit;
  pf.cededPremium = event.params.cededPremium;
  pf.inceptionTime = event.params.inceptionTime;
  pf.expiryTime = event.params.expiryTime;
  pf.status = "SUBMITTED";
  pf.expectedLossBps = 0;
  pf.allocated = BigInt.zero();
  pf.premiumsReceivedGross = BigInt.zero();
  pf.submittedAt = event.block.timestamp;
  pf.updatedAt = event.block.timestamp;
  pf.save();

  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.cedant;
  p.amount = event.params.coverageLimit;
  logEvent(event, "PortfolioRegistry", "PortfolioSubmitted", p);
}

export function handlePortfolioReviewStarted(event: PortfolioReviewStarted): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "IN_REVIEW";
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.curator;
  logEvent(event, "PortfolioRegistry", "PortfolioReviewStarted", p);
}

export function handlePortfolioApproved(event: PortfolioApproved): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "APPROVED";
  pf.expectedLossBps = event.params.expectedLossBps;
  pf.approvedAt = event.block.timestamp;
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.curator;
  logEvent(event, "PortfolioRegistry", "PortfolioApproved", p);
}

export function handlePortfolioRejected(event: PortfolioRejected): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "REJECTED";
  pf.rejectReason = event.params.reason;
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.curator;
  logEvent(event, "PortfolioRegistry", "PortfolioRejected", p);
}

export function handlePortfolioActivated(event: PortfolioActivated): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "ACTIVE";
  pf.activatedAt = event.block.timestamp;
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.curator;
  logEvent(event, "PortfolioRegistry", "PortfolioActivated", p);
}

export function handlePortfolioPaused(event: PortfolioPaused): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "PAUSED";
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.sentinel;
  logEvent(event, "PortfolioRegistry", "PortfolioPaused", p);
}

export function handlePortfolioUnpaused(event: PortfolioUnpaused): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "ACTIVE";
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.sentinel;
  logEvent(event, "PortfolioRegistry", "PortfolioUnpaused", p);
}

export function handlePortfolioExpired(event: PortfolioExpired): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.status = "EXPIRED";
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  logEvent(event, "PortfolioRegistry", "PortfolioExpired", p);
}

export function handlePortfolioMetadataUpdated(event: PortfolioMetadataUpdated): void {
  const pf = mustLoad(event.params.portfolioId, event.block.timestamp);
  pf.metadataURI = event.params.metadataURI;
  pf.documentHash = event.params.documentHash;
  pf.save();
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  logEvent(event, "PortfolioRegistry", "PortfolioMetadataUpdated", p);
}
