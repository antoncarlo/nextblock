#!/usr/bin/env node
// NextBlock address book anti-drift check.
//
// Recomputes the expected generated module in memory from the canonical
// deployment record (contracts/deployments/84532-staging.json) and compares it
// byte-for-byte with app/src/config/generated/addressBook.ts.
//
// Exit codes: 0 when aligned, 1 when the generated file is missing or drifted.
//
// Author: Anton Carlo Santoro

import { existsSync, readFileSync } from "node:fs";
import {
  OUTPUT_FILE,
  loadDeployment,
  renderAddressBook,
} from "./generate-addressbook.mjs";

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
