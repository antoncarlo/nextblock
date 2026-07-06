// ComplianceRegistry mappings: one aggregate row per address with the
// current gate state, plus the audit feed of every change.

import { Address, BigInt } from "@graphprotocol/graph-ts";
import {
  WhitelistUpdated,
  BlockedStatusUpdated,
  JurisdictionUpdated,
  KycExpiryUpdated,
  InvestorLimitUpdated,
  ApprovedVenueUpdated,
} from "../generated/ComplianceRegistry/ComplianceRegistry";
import { ComplianceAccount } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

function accountOf(addr: Address, ts: BigInt): ComplianceAccount {
  let a = ComplianceAccount.load(addr.toHexString());
  if (a == null) {
    a = new ComplianceAccount(addr.toHexString());
    a.whitelisted = false;
    a.blocked = false;
    a.jurisdiction = 0;
    a.kycExpiry = BigInt.zero();
    a.investorLimit = BigInt.zero();
    a.approvedVenue = false;
  }
  a.updatedAt = ts;
  return a as ComplianceAccount;
}

export function handleWhitelistUpdated(event: WhitelistUpdated): void {
  const a = accountOf(event.params.user, event.block.timestamp);
  a.whitelisted = event.params.allowed;
  a.save();
  const p = new LogParams();
  p.actor = event.params.user;
  logEvent(event, "ComplianceRegistry", "WhitelistUpdated", p);
}

export function handleBlockedStatusUpdated(event: BlockedStatusUpdated): void {
  const a = accountOf(event.params.user, event.block.timestamp);
  a.blocked = event.params.blocked;
  a.save();
  const p = new LogParams();
  p.actor = event.params.user;
  logEvent(event, "ComplianceRegistry", "BlockedStatusUpdated", p);
}

export function handleJurisdictionUpdated(event: JurisdictionUpdated): void {
  const a = accountOf(event.params.user, event.block.timestamp);
  a.jurisdiction = event.params.code;
  a.save();
  const p = new LogParams();
  p.actor = event.params.user;
  logEvent(event, "ComplianceRegistry", "JurisdictionUpdated", p);
}

export function handleKycExpiryUpdated(event: KycExpiryUpdated): void {
  const a = accountOf(event.params.user, event.block.timestamp);
  a.kycExpiry = event.params.expiry;
  a.save();
  const p = new LogParams();
  p.actor = event.params.user;
  logEvent(event, "ComplianceRegistry", "KycExpiryUpdated", p);
}

export function handleInvestorLimitUpdated(event: InvestorLimitUpdated): void {
  const a = accountOf(event.params.user, event.block.timestamp);
  a.investorLimit = event.params.limit;
  a.save();
  const p = new LogParams();
  p.actor = event.params.user;
  p.amount = event.params.limit;
  logEvent(event, "ComplianceRegistry", "InvestorLimitUpdated", p);
}

export function handleApprovedVenueUpdated(event: ApprovedVenueUpdated): void {
  const a = accountOf(event.params.venue, event.block.timestamp);
  a.approvedVenue = event.params.approved;
  a.save();
  const p = new LogParams();
  p.actor = event.params.venue;
  logEvent(event, "ComplianceRegistry", "ApprovedVenueUpdated", p);
}
