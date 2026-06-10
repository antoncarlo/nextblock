// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "../src/ProtocolRoles.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";

/// @title SanityCheck
/// @author Anton Carlo Santoro
/// @notice Phase 11: READ-ONLY post-deploy sanity check. Loads
///         `deployments/<chainId>-staging.json` (or DEPLOYMENT_FILE) and
///         verifies, WITHOUT broadcasting any transaction:
///           1. every module address has code (code.length > 0);
///           2. canonical roles are held by the configured addresses;
///           3. the vault is bound to ClaimManager/VaultAllocator (Phase 9.5);
///           4. the Lens is configured and the vault dashboard is AVAILABLE
///              (the UI can read immediately after deploy);
///           5. the mock USDC has 6 decimals and a capped public faucet.
///         Reverts on the first failed check; logs SANITY OK on success.
contract SanityCheck is Script, ProtocolRoleConstants {
    using stdJson for string;

    error SanityCheck__Failed(string check);

    string internal json;

    function run() external {
        string memory path =
            vm.envOr("DEPLOYMENT_FILE", string.concat("deployments/", vm.toString(block.chainid), "-staging.json"));
        json = vm.readFile(path);
        console2.log("checking deployment:", path);

        // 1. Address book: every module must have code.
        string[17] memory keys = [
            "usdc",
            "protocolRoles",
            "policyRegistry",
            "claimReceipt",
            "mockOracle",
            "complianceRegistry",
            "portfolioRegistry",
            "navOracle",
            "aiAssessor",
            "premiumDistributor",
            "vaultAllocator",
            "claimManager",
            "bordereauOracle",
            "adapterRegistry",
            "vaultFactory",
            "vault",
            "lens"
        ];
        for (uint256 i = 0; i < keys.length; i++) {
            if (_addr(keys[i]).code.length == 0) {
                revert SanityCheck__Failed(string.concat("no code: ", keys[i]));
            }
        }

        ProtocolRoles roles = ProtocolRoles(_addr("protocolRoles"));
        InsuranceVault vault = InsuranceVault(_addr("vault"));
        NextBlockLens lens = NextBlockLens(_addr("lens"));
        MockUSDC usdc = MockUSDC(_addr("usdc"));

        // 2. Canonical roles.
        _requireRole(roles, OWNER_ROLE, _addr("owner"), "owner");
        _requireRole(roles, UNDERWRITING_CURATOR_ROLE, _addr("curator"), "curator");
        _requireRole(roles, SENTINEL_ROLE, _addr("sentinel"), "sentinel");
        _requireRole(roles, CLAIMS_COMMITTEE_ROLE, _addr("committee"), "committee");
        _requireRole(roles, ALLOCATOR_ROLE, _addr("allocatorBot"), "allocatorBot");
        _requireRole(roles, ALLOCATOR_ROLE, _addr("vaultAllocator"), "allocatorContract");
        _requireRole(roles, ORACLE_ROLE, _addr("oracleNode"), "oracleNode");
        _requireRole(roles, AUTHORIZED_CEDANT_ROLE, _addr("cedant"), "cedant");
        _requireRole(roles, KYC_OPERATOR_ROLE, _addr("kycOperator"), "kycOperator");
        _requireRole(roles, PREMIUM_DEPOSITOR_ROLE, _addr("premiumDistributor"), "distributor");

        // 3. Phase 9.5 bindings: sole claim/allocation paths.
        if (vault.claimManager() != _addr("claimManager")) {
            revert SanityCheck__Failed("vault.claimManager binding");
        }
        if (vault.vaultAllocator() != _addr("vaultAllocator")) {
            revert SanityCheck__Failed("vault.vaultAllocator binding");
        }

        // 4. Lens readable now (UI-ready).
        NextBlockLens.ProtocolStatusView memory ps = lens.getProtocolStatus();
        if (ps.modules.claimManager != _addr("claimManager")) {
            revert SanityCheck__Failed("lens module book");
        }
        if (ps.vaultCount == 0) revert SanityCheck__Failed("lens vaultCount");
        NextBlockLens.VaultDashboardView memory vd = lens.getVaultDashboard(address(vault));
        if (vd.status != NextBlockLens.DataStatus.AVAILABLE) {
            revert SanityCheck__Failed("lens vault dashboard");
        }

        // 5. Settlement asset shape + faucet control.
        if (usdc.decimals() != 6) revert SanityCheck__Failed("usdc decimals");
        if (usdc.FAUCET_CAP() == 0) revert SanityCheck__Failed("usdc faucet cap");

        console2.log("SANITY OK - modules live, roles set, lens readable, vault bound.");
    }

    function _addr(string memory key) internal view returns (address) {
        return json.readAddress(string.concat(".", key));
    }

    function _requireRole(ProtocolRoles roles, bytes32 role, address holder, string memory tag) internal view {
        if (!roles.hasRole(role, holder)) {
            revert SanityCheck__Failed(string.concat("missing role: ", tag));
        }
    }
}
