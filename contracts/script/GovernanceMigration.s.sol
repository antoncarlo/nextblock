// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";

/// @title GovernanceMigration
/// @author Anton Carlo Santoro
/// @notice Two-phase governance hardening for the Base Sepolia staging stack.
///         Phase 1 (this script, DEPLOY_ONLY=true): deploy ProtocolTimelock with
///         the protocol Safe as proposer/canceller, then grant OWNER_ROLE and
///         DEFAULT_ADMIN_ROLE on ProtocolRoles to the timelock. The deployer EOA
///         keeps its roles so staging operations continue while the Safe flow is
///         rehearsed.
///         Phase 2 (RENOUNCE_DEPLOYER=true, run only after a successful timelocked
///         operation has been executed end-to-end on staging): the deployer EOA
///         renounces OWNER_ROLE and DEFAULT_ADMIN_ROLE, leaving the timelock as
///         the only role administrator. IRREVERSIBLE for the EOA.
/// @dev Required environment:
///        PROTOCOL_ROLES   address of the deployed ProtocolRoles (84532 staging)
///        SAFE_ADDRESS     protocol Safe (proposer + canceller)
///        EXECUTOR_ADDRESS operational executor (or the Safe itself)
///        MIN_DELAY        operation delay in seconds (>= 1 hours floor)
///        TIMELOCK_ADDRESS (phase 2 only) previously deployed ProtocolTimelock
///      Flags:
///        RENOUNCE_DEPLOYER=true enables phase 2. Never combine with phase 1
///        in the same run: rehearse the timelock first.
contract GovernanceMigration is Script {
    function run() external {
        ProtocolRoles roles = ProtocolRoles(vm.envAddress("PROTOCOL_ROLES"));
        bool renounceDeployer = vm.envOr("RENOUNCE_DEPLOYER", false);

        if (!renounceDeployer) {
            _phaseOneDeployAndGrant(roles);
        } else {
            _phaseTwoRenounce(roles);
        }
    }

    function _phaseOneDeployAndGrant(ProtocolRoles roles) internal {
        address safe = vm.envAddress("SAFE_ADDRESS");
        address executor = vm.envAddress("EXECUTOR_ADDRESS");
        uint256 minDelay = vm.envUint("MIN_DELAY");

        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = executor;

        vm.startBroadcast();
        ProtocolTimelock timelock = new ProtocolTimelock(minDelay, proposers, executors, address(0));
        roles.grantRole(roles.OWNER_ROLE(), address(timelock));
        roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock));
        vm.stopBroadcast();

        console.log("ProtocolTimelock deployed:", address(timelock));
        console.log("OWNER_ROLE + DEFAULT_ADMIN_ROLE granted to timelock.");
        console.log("Deployer roles RETAINED (phase 1). Rehearse a timelocked op,");
        console.log("then re-run with RENOUNCE_DEPLOYER=true and TIMELOCK_ADDRESS set.");
    }

    function _phaseTwoRenounce(ProtocolRoles roles) internal {
        address timelock = vm.envAddress("TIMELOCK_ADDRESS");
        require(roles.hasRole(roles.OWNER_ROLE(), timelock), "timelock missing OWNER_ROLE");
        require(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), timelock), "timelock missing DEFAULT_ADMIN_ROLE");

        vm.startBroadcast();
        roles.renounceRole(roles.OWNER_ROLE(), msg.sender);
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), msg.sender);
        vm.stopBroadcast();

        console.log("Deployer EOA renounced OWNER_ROLE and DEFAULT_ADMIN_ROLE.");
        console.log("Governance now flows exclusively through ProtocolTimelock:", timelock);
    }
}
