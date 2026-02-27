// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {MockOracle} from "../src/MockOracle.sol";

/// @title Keeper - Autonomous Claim Settlement Agent
/// @notice Reads oracle data and automatically triggers eligible claims across all vaults.
///         Supports ON_CHAIN (permissionless checkClaim) and ORACLE_DEPENDENT (reportEvent).
///         Demonstrates "agentic commerce": autonomous bots settling insurance claims
///         without human intervention across multiple vaults and verification types.
///
///         Run: forge script script/Keeper.s.sol --rpc-url https://1rpc.io/sepolia --broadcast
///
/// @dev This script:
///   1. Reads current oracle data (BTC price, flight status)
///   2. Iterates through all 8 vault policies
///   3. For ON_CHAIN policies: checks if BTC trigger condition is met -> checkClaim()
///   4. For ORACLE_DEPENDENT policies: checks if flight delayed -> reportEvent()
///   5. Skips OFF_CHAIN policies (require manual submitClaim with amount)
///   6. Logs all actions for transparency
contract Keeper is Script {
    // Ethereum Sepolia deployment (2026-02-08)
    address constant MOCK_ORACLE = 0xa335e377684d8787D1928bC2e726D70911Cb4050;
    address constant POLICY_REG  = 0x5503d1f62fD9e80996f92FE28f1367d15CD7BCb8;

    // All 8 vault addresses (Ethereum Sepolia)
    address[8] vaultAddrs = [
        0x6C100865210c5893781F35F9643fC4C05a2a3A3F, // A: Balanced Core
        0x5BC3C900C554eB9E9D16A1a47A46fA4575DDdEF6, // B: Digital Asset Shield
        0xb951Cb3CbF172a2eF806eAbF65CBFCAFC2B4608A, // C: Parametric Shield
        0xB4113804b913Fe589dDA3862A73951e0c9a682B4, // D: Conservative Yield
        0x560b25D2A51Cbb266C43545Ff5f2a6CB708827E1, // E: Catastrophe & Specialty
        0x9CA7055De286c8A72d555275e8913Fcf44A7B950, // F: Traditional Lines
        0xc022f1316c2C28595Fb032745A8D5C596D385F43, // G: Technology & Specialty
        0xe05ea241702D0c4F445f9A7Bc9f910ebbC9024C8  // H: Multi-Line Diversified
    ];

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        console.log("=== NextBlock Keeper - Autonomous Claim Settlement Agent ===");
        console.log("Keeper address:", vm.addr(deployerKey));
        console.log("");

        // Step 1: Read oracle state
        MockOracle oracle = MockOracle(MOCK_ORACLE);

        int256 btcPrice;
        uint256 btcUpdatedAt;
        bool flightDelayed;
        uint256 flightUpdatedAt;

        (btcPrice, btcUpdatedAt) = oracle.getBtcPrice();
        (flightDelayed, flightUpdatedAt) = oracle.getFlightStatus();

        console.log("--- Oracle State ---");
        console.log("BTC Price: $%s", uint256(btcPrice) / 1e8);
        console.log("BTC Last Updated:", btcUpdatedAt);
        console.log("Flight Delayed:", flightDelayed);
        console.log("Flight Last Updated:", flightUpdatedAt);
        console.log("");

        // Step 2: Scan all vaults for triggerable claims
        PolicyRegistry registry = PolicyRegistry(POLICY_REG);
        uint256 claimsTriggered = 0;

        vm.startBroadcast(deployerKey);

        for (uint256 v = 0; v < vaultAddrs.length; v++) {
            claimsTriggered += _scanVault(
                InsuranceVault(vaultAddrs[v]),
                registry,
                btcPrice,
                btcUpdatedAt,
                flightDelayed,
                flightUpdatedAt
            );
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== Keeper Run Complete ===");
        console.log("Claims triggered: %s", claimsTriggered);
    }

    function _scanVault(
        InsuranceVault vault,
        PolicyRegistry registry,
        int256 btcPrice,
        uint256 btcUpdatedAt,
        bool flightDelayed,
        uint256 flightUpdatedAt
    ) internal returns (uint256 triggered) {
        string memory vaultName = vault.vaultName();
        uint256[] memory policyIds = vault.getPolicyIds();

        console.log("--- Scanning Vault: %s ---", vaultName);
        console.log("  Policies: %s", policyIds.length);

        for (uint256 p = 0; p < policyIds.length; p++) {
            triggered += _checkPolicy(
                vault, registry, policyIds[p],
                btcPrice, btcUpdatedAt,
                flightDelayed, flightUpdatedAt
            );
        }
    }

    function _checkPolicy(
        InsuranceVault vault,
        PolicyRegistry registry,
        uint256 policyId,
        int256 btcPrice,
        uint256 btcUpdatedAt,
        bool flightDelayed,
        uint256 flightUpdatedAt
    ) internal returns (uint256) {
        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);

        // Check if already claimed in this vault
        (,,,,bool claimed,) = vault.vaultPolicies(policyId);
        if (claimed) {
            console.log("  Policy %s: already claimed, skipping", policyId);
            return 0;
        }

        // Route by verification type
        if (policy.verificationType == PolicyRegistry.VerificationType.ON_CHAIN) {
            return _handleOnChain(vault, policy, policyId, btcPrice, btcUpdatedAt);
        } else if (policy.verificationType == PolicyRegistry.VerificationType.ORACLE_DEPENDENT) {
            return _handleOracleDependent(vault, policyId, flightDelayed, flightUpdatedAt);
        } else {
            // OFF_CHAIN: requires manual submitClaim(policyId, amount) by insurer
            console.log("  Policy %s: OFF_CHAIN (manual), skipping", policyId);
            return 0;
        }
    }

    function _handleOnChain(
        InsuranceVault vault,
        PolicyRegistry.Policy memory policy,
        uint256 policyId,
        int256 btcPrice,
        uint256 btcUpdatedAt
    ) internal returns (uint256) {
        // Check trigger condition: BTC price <= threshold
        if (btcPrice <= policy.triggerThreshold && btcUpdatedAt > 0) {
            console.log("  Policy %s [ON_CHAIN]: TRIGGER CONDITION MET!", policyId);

            try vault.checkClaim(policyId) {
                console.log("    -> checkClaim() succeeded!");
                return 1;
            } catch {
                console.log("    -> checkClaim() failed (may be expired or already processed)");
            }
        } else {
            console.log("  Policy %s [ON_CHAIN]: no trigger (price above threshold)", policyId);
        }

        return 0;
    }

    function _handleOracleDependent(
        InsuranceVault vault,
        uint256 policyId,
        bool flightDelayed,
        uint256 flightUpdatedAt
    ) internal returns (uint256) {
        // Check if oracle reports a flight delay
        if (flightDelayed && flightUpdatedAt > 0) {
            console.log("  Policy %s [ORACLE]: Flight delayed -> triggering!", policyId);

            try vault.reportEvent(policyId) {
                console.log("    -> reportEvent() succeeded!");
                return 1;
            } catch {
                console.log("    -> reportEvent() failed (may be expired, already claimed, or role missing)");
            }
        } else {
            console.log("  Policy %s [ORACLE]: no trigger (flight on time)", policyId);
        }

        return 0;
    }
}
