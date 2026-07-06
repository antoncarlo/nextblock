// PolicyRegistry mappings: policy registration/activation and the one-way
// real-time lock (a protocol-level milestone worth having in the feed).

import {
  PolicyRegistered,
  PolicyActivated,
  RealTimeLocked,
} from "../generated/PolicyRegistry/PolicyRegistry";
import { Policy } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

export function handlePolicyRegistered(event: PolicyRegistered): void {
  const pol = new Policy(event.params.policyId.toString());
  pol.name = event.params.name;
  pol.verificationType = event.params.verificationType;
  pol.registeredAt = event.block.timestamp;
  pol.activated = false;
  pol.save();

  const p = new LogParams();
  logEvent(event, "PolicyRegistry", "PolicyRegistered", p);
}

export function handlePolicyActivated(event: PolicyActivated): void {
  const pol = Policy.load(event.params.policyId.toString());
  if (pol != null) {
    pol.activated = true;
    pol.startTime = event.params.startTime;
    pol.save();
  }
  const p = new LogParams();
  logEvent(event, "PolicyRegistry", "PolicyActivated", p);
}

export function handleRealTimeLocked(event: RealTimeLocked): void {
  const p = new LogParams();
  p.amount = event.params.at;
  logEvent(event, "PolicyRegistry", "RealTimeLocked", p);
}
