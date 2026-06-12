// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";

/// @title GovernanceCheck
/// @author Anton Carlo Santoro
/// @notice READ-ONLY governance audit for the Base Sepolia staging stack.
///         Prints the current holder map for every protocol role plus the
///         timelock wiring, so Phase 2 decisions are made against verified
///         on-chain state instead of assumptions.
/// @dev Pure simulation: run WITHOUT --broadcast and without any key.
///
///         forge script script/GovernanceCheck.s.sol \
///           --rpc-url ${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}
///
///         Addresses are read from deployments/84532-staging.json (the
///         canonical address book); nothing is hardcoded here.
contract GovernanceCheck is Script {
    string[10] internal roleNames = [
        "OWNER_ROLE",
        "UNDERWRITING_CURATOR_ROLE",
        "ALLOCATOR_ROLE",
        "SENTINEL_ROLE",
        "CLAIMS_COMMITTEE_ROLE",
        "PREMIUM_DEPOSITOR_ROLE",
        "AUTHORIZED_CEDANT_ROLE",
        "VAULT_FACTORY_ROLE",
        "KYC_OPERATOR_ROLE",
        "ORACLE_ROLE"
    ];

    function run() external view {
        string memory book = vm.readFile("deployments/84532-staging.json");
        ProtocolRoles roles = ProtocolRoles(vm.parseJsonAddress(book, ".protocolRoles"));
        ProtocolTimelock timelock = ProtocolTimelock(payable(vm.parseJsonAddress(book, ".protocolTimelock")));
        address safe = vm.parseJsonAddress(book, ".safe");
        address deployer = vm.parseJsonAddress(book, ".deployer");
        address vaultFactory = vm.parseJsonAddress(book, ".vaultFactory");

        console.log("=== ProtocolRoles holder map (deployer / timelock / safe) ===");
        console.log("protocolRoles:", address(roles));
        for (uint256 i = 0; i < roleNames.length; i++) {
            bytes32 role = keccak256(bytes(roleNames[i]));
            console.log(roleNames[i]);
            console.log("  deployer:", roles.hasRole(role, deployer));
            console.log("  timelock:", roles.hasRole(role, address(timelock)));
            console.log("  safe:    ", roles.hasRole(role, safe));
        }
        console.log("DEFAULT_ADMIN_ROLE");
        console.log("  deployer:", roles.hasRole(0x00, deployer));
        console.log("  timelock:", roles.hasRole(0x00, address(timelock)));
        console.log("  safe:    ", roles.hasRole(0x00, safe));
        console.log("VAULT_FACTORY_ROLE on factory contract:");
        console.log("  factory: ", roles.hasRole(keccak256("VAULT_FACTORY_ROLE"), vaultFactory));

        console.log("=== ProtocolTimelock wiring ===");
        console.log("timelock:", address(timelock));
        console.log("minDelay:", timelock.getMinDelay());
        console.log("safe is PROPOSER: ", timelock.hasRole(timelock.PROPOSER_ROLE(), safe));
        console.log("safe is EXECUTOR: ", timelock.hasRole(timelock.EXECUTOR_ROLE(), safe));
        console.log("safe is CANCELLER:", timelock.hasRole(timelock.CANCELLER_ROLE(), safe));
        console.log("timelock self-admin:", timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)));
        console.log(
            "deployer timelock-admin (expected false):", timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer)
        );

        console.log("=== Phase 2 readiness summary ===");
        bool timelockHoldsOwner = roles.hasRole(keccak256("OWNER_ROLE"), address(timelock));
        bool timelockHoldsAdmin = roles.hasRole(0x00, address(timelock));
        bool deployerStillOwner = roles.hasRole(keccak256("OWNER_ROLE"), deployer);
        console.log("timelock holds OWNER_ROLE:        ", timelockHoldsOwner);
        console.log("timelock holds DEFAULT_ADMIN_ROLE:", timelockHoldsAdmin);
        console.log("deployer still holds OWNER_ROLE (phase 2 pending):", deployerStillOwner);
    }
}
