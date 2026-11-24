#!/usr/bin/env node
// NextBlock address book anti-drift check.
//
// Recomputes the expected generated module in memory from the canonical
// deployment record (contracts/deployments/84532-staging.json) and compares it
// byte-for-byte with app/src/config/generated/addressBook.ts.
//
// It also checks that DeployStack still writes every address the generator
// requires. The committed record describes the generation already deployed, so
// comparing against it alone cannot see that the next deploy will produce a
// record the generator refuses.
//
// Exit codes: 0 when aligned, 1 when the generated file is missing or drifted,
// or when a required address is no longer written by the deploy script.
//
// Author: Anton Carlo Santoro

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTRACT_KEYS,
  HAND_RECORDED_KEYS,
  OUTPUT_FILE,
  loadDeployment,
  renderAddressBook,
} from "./generate-addressbook.mjs";

const deployScript = readFileSync(
  join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "contracts", "script", "DeployStack.s.sol"),
  "utf8",
);
const written = new Set(
  [...deployScript.matchAll(/serializeAddress\(\s*obj,\s*"(\w+)"/g)].map((m) => m[1]),
);
const unwritten = CONTRACT_KEYS.filter((key) => !written.has(key) && !HAND_RECORDED_KEYS.includes(key));
if (unwritten.length > 0) {
  console.error(
    `addressbook check: FAIL - DeployStack.s.sol no longer writes: ${unwritten.join(", ")}. After the next deploy the generator would refuse the record. Write the address in the script, or drop the key from CONTRACT_KEYS.`,
  );
  process.exit(1);
}

const expected = renderAddressBook(loadDeployment());

if (!existsSync(OUTPUT_FILE)) {
  console.error(
    "addressbook check: FAIL - app/src/config/generated/addressBook.ts is missing. Run: npm run codegen:addressbook",
  );
  process.exit(1);
}

const actual = readFileSync(OUTPUT_FILE, "utf8");

if (actual !== expected) {
  console.error(
    "addressbook check: FAIL - addressBook.ts has drifted from contracts/deployments/84532-staging.json. Run: npm run codegen:addressbook and review the diff.",
  );
  process.exit(1);
}

console.log(
  "addressbook check: OK - addressBook.ts is aligned with contracts/deployments/84532-staging.json",
);
