// PremiumDistributor mappings: every premium movement as an immutable
// PremiumFlow row (the money-flow ledger's historical backbone), plus the
// portfolio's gross received aggregate.

import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  PremiumReceived,
  PremiumAllocated,
  ProtocolFeeAccrued,
  UnderwritingFeeAccrued,
  ProtocolFeesClaimed,
  UnderwritingFeesClaimed,
  PortfolioVaultSet,
} from "../generated/PremiumDistributor/PremiumDistributor";
import { PremiumFlow, Portfolio } from "../generated/schema";
import { eventId, logEvent, LogParams } from "./helpers";

function flow(
  event: ethereum.Event,
  portfolioId: BigInt,
  kind: string,
  counterparty: Bytes | null,
  amount: BigInt,
): void {
  const f = new PremiumFlow(eventId(event));
  f.portfolioId = portfolioId;
  f.kind = kind;
  f.counterparty = counterparty;
  f.amount = amount;
  f.timestamp = event.block.timestamp;
  f.blockNumber = event.block.number;
  f.txHash = event.transaction.hash;
  f.save();
}

export function handlePremiumReceived(event: PremiumReceived): void {
  flow(event, event.params.portfolioId, "RECEIVED", event.params.from, event.params.grossAmount);

  const pf = Portfolio.load(event.params.portfolioId.toString());
  if (pf != null) {
    pf.premiumsReceivedGross = pf.premiumsReceivedGross.plus(event.params.grossAmount);
    pf.updatedAt = event.block.timestamp;
    pf.save();
  }

  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.from;
  p.amount = event.params.grossAmount;
  logEvent(event, "PremiumDistributor", "PremiumReceived", p);
}

export function handlePremiumAllocated(event: PremiumAllocated): void {
  flow(event, event.params.portfolioId, "ALLOCATED", event.params.vault, event.params.lpQuota);
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.vault = event.params.vault;
  p.amount = event.params.lpQuota;
  logEvent(event, "PremiumDistributor", "PremiumAllocated", p);
}

export function handleProtocolFeeAccrued(event: ProtocolFeeAccrued): void {
  flow(event, event.params.portfolioId, "PROTOCOL_FEE", null, event.params.amount);
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.amount = event.params.amount;
  logEvent(event, "PremiumDistributor", "ProtocolFeeAccrued", p);
}

export function handleUnderwritingFeeAccrued(event: UnderwritingFeeAccrued): void {
  flow(event, event.params.portfolioId, "UNDERWRITING_FEE", null, event.params.amount);
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.amount = event.params.amount;
  logEvent(event, "PremiumDistributor", "UnderwritingFeeAccrued", p);
}

export function handleProtocolFeesClaimed(event: ProtocolFeesClaimed): void {
  flow(event, BigInt.zero(), "PROTOCOL_FEES_CLAIMED", event.params.recipient, event.params.amount);
  const p = new LogParams();
  p.actor = event.params.recipient;
  p.amount = event.params.amount;
  logEvent(event, "PremiumDistributor", "ProtocolFeesClaimed", p);
}

export function handleUnderwritingFeesClaimed(event: UnderwritingFeesClaimed): void {
  flow(
    event,
    BigInt.zero(),
    "UNDERWRITING_FEES_CLAIMED",
    event.params.recipient,
    event.params.amount,
  );
  const p = new LogParams();
  p.actor = event.params.recipient;
  p.amount = event.params.amount;
  logEvent(event, "PremiumDistributor", "UnderwritingFeesClaimed", p);
}

export function handlePortfolioVaultSet(event: PortfolioVaultSet): void {
  const pf = Portfolio.load(event.params.portfolioId.toString());
  if (pf != null) {
    pf.vault = event.params.vault;
    pf.updatedAt = event.block.timestamp;
    pf.save();
  }
  const p = new LogParams();
  p.portfolioId = event.params.portfolioId;
  p.vault = event.params.vault;
  logEvent(event, "PremiumDistributor", "PortfolioVaultSet", p);
}
