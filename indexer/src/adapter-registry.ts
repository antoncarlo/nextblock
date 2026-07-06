// AdapterRegistry mappings: risk-pool adapter registry state machine.
// REGISTERED → ACTIVE → DISABLED / DEPRECATED.

import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AdapterRegistered,
  AdapterActivated,
  AdapterDisabled,
  AdapterDeprecated,
  AdapterExposureCapUpdated,
} from "../generated/AdapterRegistry/AdapterRegistry";
import { Adapter } from "../generated/schema";
import { logEvent, LogParams } from "./helpers";

function touch(id: Bytes, ts: BigInt): Adapter | null {
  const a = Adapter.load(id.toHexString());
  if (a != null) a.updatedAt = ts;
  return a;
}

export function handleAdapterRegistered(event: AdapterRegistered): void {
  const a = new Adapter(event.params.adapterId.toHexString());
  a.adapter = event.params.adapter;
  a.name = event.params.name;
  a.metadataHash = event.params.metadataHash;
  a.exposureCap = event.params.exposureCap;
  a.status = "REGISTERED";
  a.updatedAt = event.block.timestamp;
  a.save();

  const p = new LogParams();
  p.actor = event.params.adapter;
  p.amount = event.params.exposureCap;
  logEvent(event, "AdapterRegistry", "AdapterRegistered", p);
}

export function handleAdapterActivated(event: AdapterActivated): void {
  const a = touch(event.params.adapterId, event.block.timestamp);
  if (a != null) {
    a.status = "ACTIVE";
    a.save();
  }
  const p = new LogParams();
  p.actor = event.params.by;
  logEvent(event, "AdapterRegistry", "AdapterActivated", p);
}

export function handleAdapterDisabled(event: AdapterDisabled): void {
  const a = touch(event.params.adapterId, event.block.timestamp);
  if (a != null) {
    a.status = "DISABLED";
    a.save();
  }
  const p = new LogParams();
  p.actor = event.params.by;
  logEvent(event, "AdapterRegistry", "AdapterDisabled", p);
}

export function handleAdapterDeprecated(event: AdapterDeprecated): void {
  const a = touch(event.params.adapterId, event.block.timestamp);
  if (a != null) {
    a.status = "DEPRECATED";
    a.save();
  }
  const p = new LogParams();
  p.actor = event.params.by;
  logEvent(event, "AdapterRegistry", "AdapterDeprecated", p);
}

export function handleAdapterExposureCapUpdated(event: AdapterExposureCapUpdated): void {
  const a = touch(event.params.adapterId, event.block.timestamp);
  if (a != null) {
    a.exposureCap = event.params.exposureCap;
    a.save();
  }
  const p = new LogParams();
  p.amount = event.params.exposureCap;
  logEvent(event, "AdapterRegistry", "AdapterExposureCapUpdated", p);
}
