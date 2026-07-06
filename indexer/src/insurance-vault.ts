// InsuranceVault template mappings: LP flows (ERC-4626 Deposit/Withdraw),
// portfolio allocations, premium recording, claim reserves and payouts.
// The Vault aggregate is created by the factory handler; a defensive loader
// covers vaults that might predate the factory datasource startBlock.

import { BigInt, Address, ethereum } from "@graphprotocol/graph-ts";
import {
  Deposit,
  Withdraw,
  PortfolioAllocated,
  PortfolioDeallocated,
  PortfolioPremiumRecorded,
  PortfolioClaimReserved,
  PortfolioClaimReserveReleased,
  PortfolioClaimPaid,
  FeesCollected,
} from "../generated/templates/InsuranceVault/InsuranceVault";
import { Vault, VaultDeposit, VaultWithdrawal, Portfolio, Claim } from "../generated/schema";
import { eventId, logEvent, LogParams } from "./helpers";

function vaultOf(addr: Address, block: ethereum.Block): Vault {
  let v = Vault.load(addr.toHexString());
  if (v == null) {
    v = new Vault(addr.toHexString());
    v.name = "";
    v.symbol = "";
    v.displayName = "";
    v.manager = addr;
    v.bufferRatioBps = BigInt.zero();
    v.managementFeeBps = BigInt.zero();
    v.createdAt = block.timestamp;
    v.createdAtBlock = block.number;
    v.depositCount = 0;
    v.withdrawCount = 0;
    v.totalDeposited = BigInt.zero();
    v.totalWithdrawn = BigInt.zero();
    v.premiumsRecorded = BigInt.zero();
    v.claimsReserved = BigInt.zero();
    v.claimsPaid = BigInt.zero();
    v.feesCollected = BigInt.zero();
  }
  return v as Vault;
}

export function handleDeposit(event: Deposit): void {
  const v = vaultOf(event.address, event.block);
  v.depositCount = v.depositCount + 1;
  v.totalDeposited = v.totalDeposited.plus(event.params.assets);
  v.save();

  const d = new VaultDeposit(eventId(event));
  d.vault = v.id;
  d.sender = event.params.sender;
  d.owner = event.params.owner;
  d.assets = event.params.assets;
  d.shares = event.params.shares;
  d.timestamp = event.block.timestamp;
  d.blockNumber = event.block.number;
  d.txHash = event.transaction.hash;
  d.save();

  const p = new LogParams();
  p.vault = event.address;
  p.actor = event.params.owner;
  p.amount = event.params.assets;
  logEvent(event, "InsuranceVault", "Deposit", p);
}

export function handleWithdraw(event: Withdraw): void {
  const v = vaultOf(event.address, event.block);
  v.withdrawCount = v.withdrawCount + 1;
  v.totalWithdrawn = v.totalWithdrawn.plus(event.params.assets);
  v.save();

  const w = new VaultWithdrawal(eventId(event));
  w.vault = v.id;
  w.sender = event.params.sender;
  w.receiver = event.params.receiver;
  w.owner = event.params.owner;
  w.assets = event.params.assets;
  w.shares = event.params.shares;
  w.timestamp = event.block.timestamp;
  w.blockNumber = event.block.number;
  w.txHash = event.transaction.hash;
  w.save();

  const p = new LogParams();
  p.vault = event.address;
  p.actor = event.params.owner;
  p.amount = event.params.assets;
  logEvent(event, "InsuranceVault", "Withdraw", p);
}

function adjustPortfolioAllocation(portfolioId: BigInt, delta: BigInt, ts: BigInt): void {
  const pf = Portfolio.load(portfolioId.toString());
  if (pf != null) {
    pf.allocated = pf.allocated.plus(delta);
    pf.updatedAt = ts;
    pf.save();
  }
}

export function handlePortfolioAllocated(event: PortfolioAllocated): void {
  adjustPortfolioAllocation(event.params.portfolioId, event.params.amount, event.block.timestamp);
  const p = new LogParams();
  p.vault = event.address;
  p.portfolioId = event.params.portfolioId;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "PortfolioAllocated", p);
}

export function handlePortfolioDeallocated(event: PortfolioDeallocated): void {
  adjustPortfolioAllocation(
    event.params.portfolioId,
    event.params.amount.neg(),
    event.block.timestamp,
  );
  const p = new LogParams();
  p.vault = event.address;
  p.portfolioId = event.params.portfolioId;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "PortfolioDeallocated", p);
}

export function handlePortfolioPremiumRecorded(event: PortfolioPremiumRecorded): void {
  const v = vaultOf(event.address, event.block);
  v.premiumsRecorded = v.premiumsRecorded.plus(event.params.amount);
  v.save();

  const p = new LogParams();
  p.vault = event.address;
  p.portfolioId = event.params.portfolioId;
  p.actor = event.params.from;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "PortfolioPremiumRecorded", p);
}

export function handlePortfolioClaimReserved(event: PortfolioClaimReserved): void {
  const v = vaultOf(event.address, event.block);
  v.claimsReserved = v.claimsReserved.plus(event.params.amount);
  v.save();

  const c = Claim.load(event.params.claimId.toString());
  if (c != null) {
    c.reserved = c.reserved.plus(event.params.amount);
    c.updatedAt = event.block.timestamp;
    c.save();
  }

  const p = new LogParams();
  p.vault = event.address;
  p.portfolioId = event.params.portfolioId;
  p.claimId = event.params.claimId;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "PortfolioClaimReserved", p);
}

export function handlePortfolioClaimReserveReleased(event: PortfolioClaimReserveReleased): void {
  const v = vaultOf(event.address, event.block);
  v.claimsReserved = v.claimsReserved.minus(event.params.amount);
  v.save();

  const c = Claim.load(event.params.claimId.toString());
  if (c != null) {
    c.reserved = c.reserved.minus(event.params.amount);
    c.updatedAt = event.block.timestamp;
    c.save();
  }

  const p = new LogParams();
  p.vault = event.address;
  p.portfolioId = event.params.portfolioId;
  p.claimId = event.params.claimId;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "PortfolioClaimReserveReleased", p);
}

export function handlePortfolioClaimPaid(event: PortfolioClaimPaid): void {
  const v = vaultOf(event.address, event.block);
  v.claimsReserved = v.claimsReserved.minus(event.params.amount);
  v.claimsPaid = v.claimsPaid.plus(event.params.amount);
  v.save();

  const c = Claim.load(event.params.claimId.toString());
  if (c != null) {
    c.reserved = c.reserved.minus(event.params.amount);
    c.updatedAt = event.block.timestamp;
    c.save();
  }

  const p = new LogParams();
  p.vault = event.address;
  p.portfolioId = event.params.portfolioId;
  p.claimId = event.params.claimId;
  p.actor = event.params.to;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "PortfolioClaimPaid", p);
}

export function handleFeesCollected(event: FeesCollected): void {
  const v = vaultOf(event.address, event.block);
  v.feesCollected = v.feesCollected.plus(event.params.amount);
  v.save();

  const p = new LogParams();
  p.vault = event.address;
  p.actor = event.params.recipient;
  p.amount = event.params.amount;
  logEvent(event, "InsuranceVault", "FeesCollected", p);
}
