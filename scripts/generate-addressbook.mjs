#!/usr/bin/env node
// NextBlock address book code generator.
//
// Reads the canonical deployment record (contracts/deployments/84532-staging.json)
// and emits a deterministic TypeScript module at
// app/src/config/generated/addressBook.ts for the frontend (and, later, the SDK).
//
// Address normalization choice: addresses are validated against the
// 0x + 40-hex-characters format and emitted VERBATIM, preserving the EIP-55
// checksum casing written by the deployment broadcast. No re-casing is applied:
// recomputing the checksum would require a keccak dependency and the broadcast
// output is already checksummed.
//
// Determinism: output depends only on the deployment JSON (keys are emitted in
// sorted order, no generation timestamp). Two consecutive runs over the same
// JSON produce byte-identical output.
//
// Exit codes: 0 on success, 1 on any validation or I/O failure.
//
// Author: Anton Carlo Santoro

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEPLOYMENT_JSON = join(
  REPO_ROOT,
  "contracts",
  "deployments",
  "84532-staging.json",
);

export const OUTPUT_FILE = join(
  REPO_ROOT,
  "app",
  "src",
  "config",
  "generated",
  "addressBook.ts",
);

const EXPECTED_CHAIN_ID = 84532;

const NETWORK_NAMES = {
  84532: "base-sepolia",
};

// Contract addresses the frontend already consumes (see the 84532 block in
// app/src/config/contracts.ts). All of these are REQUIRED in the JSON.
const CONTRACT_KEYS = [
  "adapterRegistry",
  "aiAssessor",
  "bordereauOracle",
  "claimManager",
  "claimReceipt",
  "complianceRegistry",
  "lens",
  "mockOracle",
  "navOracle",
  "policyRegistry",
  "portfolioRegistry",
  "premiumDistributor",
  "protocolRoles",
  "protocolTimelock",
  "safe",
  "usdc",
  "vault",
  "vaultAllocator",
  "vaultDeployer",
  "vaultFactory",
];

// Operational role addresses recorded by the deployment. OPTIONAL: exported
// when present, format-validated when present.
const ROLE_KEYS = [
  "allocatorBot",
  "cedant",
  "committee",
  "curator",
  "deployer",
  "kycOperator",
  "oracleNode",
  "owner",
  "sentinel",
];

const METADATA_KEYS = ["chainId", "schemaVersion", "timestamp", "lensVersion"];

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function fail(message) {
  console.error(`addressbook codegen: FAIL - ${message}`);
  process.exit(1);
}

export function loadDeployment() {
  if (!existsSync(DEPLOYMENT_JSON)) {
    fail(`deployment record not found: ${DEPLOYMENT_JSON}`);
  }

  let raw;
  try {
    raw = readFileSync(DEPLOYMENT_JSON, "utf8");
  } catch (err) {
    fail(`cannot read deployment record: ${err.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail(`deployment record is not valid JSON: ${err.message}`);
  }

  if (data.chainId !== EXPECTED_CHAIN_ID) {
    fail(
      `unexpected chainId: ${JSON.stringify(data.chainId)} (expected ${EXPECTED_CHAIN_ID}, Base Sepolia staging)`,
    );
  }
  if (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    fail(`missing or invalid schemaVersion: ${JSON.stringify(data.schemaVersion)}`);
  }
  if (!Number.isInteger(data.timestamp) || data.timestamp <= 0) {
    fail(`missing or invalid timestamp: ${JSON.stringify(data.timestamp)}`);
  }

  const problems = [];
  for (const key of CONTRACT_KEYS) {
    const value = data[key];
    if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
      problems.push(`missing or malformed contract address: ${key}`);
    } else if (value === ZERO_ADDRESS) {
      problems.push(`zero address for required contract: ${key}`);
    }
  }
  for (const key of ROLE_KEYS) {
    if (key in data) {
      const value = data[key];
      if (typeof value !== "string" || !ADDRESS_RE.test(value)) {
        problems.push(`malformed role address: ${key}`);
      }
    }
  }
  if (problems.length > 0) {
    fail(`invalid deployment record:\n  - ${problems.join("\n  - ")}`);
  }

  const unknown = Object.keys(data)
    .filter(
      (key) =>
        !CONTRACT_KEYS.includes(key) &&
        !ROLE_KEYS.includes(key) &&
        !METADATA_KEYS.includes(key),
    )
    .sort();
  if (unknown.length > 0) {
    console.error(
      `addressbook codegen: note - unknown keys ignored: ${unknown.join(", ")}`,
    );
  }

  return data;
}

export function renderAddressBook(data) {
  const networkName = NETWORK_NAMES[data.chainId];

  const addressEntries = CONTRACT_KEYS.slice()
    .sort()
    .map((key) => `  ${key}: "${data[key]}",`)
    .join("\n");

  const presentRoles = ROLE_KEYS.filter((key) => key in data).sort();
  const roleEntries =
    presentRoles.length > 0
      ? presentRoles.map((key) => `  ${key}: "${data[key]}",`).join("\n")
      : "  // No role addresses present in the deployment record.";

  return `// Generated file. Do not edit manually.
// Source of truth: contracts/deployments/84532-staging.json
// Regenerate with: npm run codegen:addressbook (repository root)
// Drift is rejected in CI by: npm run check:addressbook
// Addresses are emitted verbatim from the deployment record, preserving the
// EIP-55 checksum casing written by the deployment broadcast.

export const NEXTBLOCK_CHAIN_ID = ${data.chainId} as const;

export const NEXTBLOCK_NETWORK_NAME = "${networkName}" as const;

export const NEXTBLOCK_SCHEMA_VERSION = ${data.schemaVersion} as const;

export const NEXTBLOCK_DEPLOYMENT_TIMESTAMP = ${data.timestamp} as const;

export const NEXTBLOCK_ADDRESSES = {
${addressEntries}
} as const;

export const NEXTBLOCK_ROLES = {
${roleEntries}
} as const;

export type NextBlockContractName = keyof typeof NEXTBLOCK_ADDRESSES;

export type NextBlockRoleName = keyof typeof NEXTBLOCK_ROLES;

export interface NextBlockAddressBook {
  readonly chainId: typeof NEXTBLOCK_CHAIN_ID;
  readonly networkName: typeof NEXTBLOCK_NETWORK_NAME;
  readonly schemaVersion: typeof NEXTBLOCK_SCHEMA_VERSION;
  readonly deploymentTimestamp: typeof NEXTBLOCK_DEPLOYMENT_TIMESTAMP;
  readonly addresses: typeof NEXTBLOCK_ADDRESSES;
  readonly roles: typeof NEXTBLOCK_ROLES;
}

export const NEXTBLOCK_ADDRESS_BOOK: NextBlockAddressBook = {
  chainId: NEXTBLOCK_CHAIN_ID,
  networkName: NEXTBLOCK_NETWORK_NAME,
  schemaVersion: NEXTBLOCK_SCHEMA_VERSION,
  deploymentTimestamp: NEXTBLOCK_DEPLOYMENT_TIMESTAMP,
  addresses: NEXTBLOCK_ADDRESSES,
  roles: NEXTBLOCK_ROLES,
};
`;
}

export function generate() {
  const data = loadDeployment();
  const output = renderAddressBook(data);
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, output, "utf8");
  console.log(
    "addressbook codegen: OK - wrote app/src/config/generated/addressBook.ts",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  generate();
}
