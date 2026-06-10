// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

/// @title Keeper (RETIRED — Phase 9.5 security hardening)
/// @author Anton Carlo Santoro
/// @notice The legacy autonomous claim-settlement keeper has been retired.
///         It depended on the LEGACY vault claim triggers (checkClaim /
///         reportEvent), which were REMOVED from InsuranceVault: the only
///         claim flow is now the institutional ClaimManager path
///         (cedant submission -> AI advisory -> dispute window -> Claims
///         Committee approval -> vault payout). An automated keeper for the
///         institutional flow (e.g. executing APPROVED claims after the
///         window) may be reintroduced with the Phase 9.5 deployment-readiness
///         block, bound to ClaimManager.executeClaim only.
contract Keeper is Script {
    function run() external pure {
        console.log("Keeper retired: legacy vault claim triggers were removed (Phase 9.5).");
        console.log("Use the ClaimManager lifecycle; see contracts/README.md and CHANGELOG.md.");
    }
}
