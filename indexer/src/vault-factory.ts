// VaultFactory mappings: registers each vault and spawns the InsuranceVault
// data-source template so every vault ever created is indexed automatically.

import { BigInt } from "@graphprotocol/graph-ts";
import { VaultCreated } from "../generated/VaultFactory/VaultFactory";
import { Vault } from "../generated/schema";
import { InsuranceVault } from "../generated/templates";
import { logEvent, LogParams } from "./helpers";

export function handleVaultCreated(event: VaultCreated): void {
  const id = event.params.vault.toHexString();
  const v = new Vault(id);
  v.name = event.params.name;
  v.symbol = event.params.symbol;
  v.displayName = event.params.vaultName;
  v.manager = event.params.vaultManager;
  v.bufferRatioBps = event.params.bufferRatioBps;
  v.managementFeeBps = event.params.managementFeeBps;
  v.createdAt = event.block.timestamp;
  v.createdAtBlock = event.block.number;
  v.depositCount = 0;
  v.withdrawCount = 0;
  v.totalDeposited = BigInt.zero();
  v.totalWithdrawn = BigInt.zero();
  v.premiumsRecorded = BigInt.zero();
  v.claimsReserved = BigInt.zero();
  v.claimsPaid = BigInt.zero();
  v.feesCollected = BigInt.zero();
  v.save();

  // Start indexing this vault's own events from here on.
  InsuranceVault.create(event.params.vault);

  const p = new LogParams();
  p.vault = event.params.vault;
  p.actor = event.params.vaultManager;
  logEvent(event, "VaultFactory", "VaultCreated", p);
}
