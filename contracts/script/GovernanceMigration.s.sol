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
///        RETIRING_KEY (phase 2 only) the EOA that renounces; must be the key
///          forge signs with, and must already hold none of the operational roles
///        REHEARSAL_OPERATION_ID (phase 2 only) id of a timelock operation that
///          has already been executed end-to-end; phase 2 refuses to run unless
///          `isOperationDone` returns true for it
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
            _phaseTwoRenounce(
                roles,
                vm.envAddress("TIMELOCK_ADDRESS"),
                vm.envAddress("RETIRING_KEY"),
                vm.envBytes32("REHEARSAL_OPERATION_ID")
            );
        }
    }

    /// @notice Phase 2 with every input passed explicitly.
    /// @dev Exists for the same reason `DeployRedemptionQueue.runWithConfig` does:
    ///      `vm.setEnv` is process-global, so a test that configures this script
    ///      through the environment races every other suite forge runs in
    ///      parallel. That race is invisible on a machine whose scheduling
    ///      happens to be stable and shows up as a gas-snapshot mismatch on CI.
    ///      Operators keep using `run()`; tests call this.
    /// @param roles_ ProtocolRoles being migrated.
    /// @param timelock ProtocolTimelock that will hold governance.
    /// @param retiringKey The EOA that renounces.
    /// @param rehearsalId A timelock operation already executed end-to-end.
    function runPhaseTwoWithConfig(address roles_, address timelock, address retiringKey, bytes32 rehearsalId) public {
        _phaseTwoRenounce(ProtocolRoles(roles_), timelock, retiringKey, rehearsalId);
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

    function _phaseTwoRenounce(ProtocolRoles roles, address timelock, address retiringKey, bytes32 rehearsalId)
        internal
    {
        require(roles.hasRole(roles.OWNER_ROLE(), timelock), "timelock missing OWNER_ROLE");
        require(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), timelock), "timelock missing DEFAULT_ADMIN_ROLE");

        // The two preconditions below used to live only in this script's NatSpec
        // and in docs/GOVERNANCE_PHASE2.md. Prose does not stop a deploy: run
        // phase 2 without Stage A and the script prints "Governance now flows
        // exclusively through ProtocolTimelock" while the deploy key still holds
        // Sentinel, Claims Committee, Oracle, Cedant, KYC Operator, Allocator and
        // Curator — every role the claim path needs for its quorum, on one key.
        // The retiring key is named explicitly rather than taken from
        // `msg.sender`. OZ's renounceRole requires callerConfirmation to equal
        // the actual caller, and inside a broadcast the caller is the broadcaster,
        // not the script's msg.sender — when the two differ the migration used to
        // fail at its last step with an opaque AccessControlBadConfirmation.
        // Naming it also lets the guards below run BEFORE any broadcast opens, so
        // a refusal leaves no half-started transaction behind.
        _requireStageAComplete(roles, retiringKey);
        _requireTimelockRehearsed(timelock, rehearsalId);

        vm.startBroadcast(retiringKey);
        roles.renounceRole(roles.OWNER_ROLE(), retiringKey);
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), retiringKey);
        vm.stopBroadcast();

        console.log("Deployer EOA renounced OWNER_ROLE and DEFAULT_ADMIN_ROLE.");
        console.log("Governance now flows exclusively through ProtocolTimelock:", timelock);
    }

    /// @dev Stage A: every operational role must already sit on a dedicated key.
    ///      `DeployStack` defaults all of them to the deployer, so without this a
    ///      "full decentralisation" leaves the retired key able to file a claim as
    ///      cedant, assess it as oracle and approve it as committee.
    /// @param roles The ProtocolRoles instance being migrated.
    /// @param deployer The key that is about to renounce (the broadcaster).
    function _requireStageAComplete(ProtocolRoles roles, address deployer) internal view {
        require(!roles.hasRole(roles.SENTINEL_ROLE(), deployer), "Stage A incomplete: deployer still SENTINEL_ROLE");
        require(
            !roles.hasRole(roles.CLAIMS_COMMITTEE_ROLE(), deployer),
            "Stage A incomplete: deployer still CLAIMS_COMMITTEE_ROLE"
        );
        require(!roles.hasRole(roles.ORACLE_ROLE(), deployer), "Stage A incomplete: deployer still ORACLE_ROLE");
        require(
            !roles.hasRole(roles.AUTHORIZED_CEDANT_ROLE(), deployer),
            "Stage A incomplete: deployer still AUTHORIZED_CEDANT_ROLE"
        );
        require(
            !roles.hasRole(roles.KYC_OPERATOR_ROLE(), deployer), "Stage A incomplete: deployer still KYC_OPERATOR_ROLE"
        );
        require(!roles.hasRole(roles.ALLOCATOR_ROLE(), deployer), "Stage A incomplete: deployer still ALLOCATOR_ROLE");
        require(
            !roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), deployer),
            "Stage A incomplete: deployer still UNDERWRITING_CURATOR_ROLE"
        );
    }

    /// @dev The rehearsal must be a real, executed operation, named by its id. A
    ///      timelock that has never executed anything is an untested single point
    ///      of failure, and this is the last moment at which that is recoverable.
    /// @param timelock The ProtocolTimelock that will hold governance.
    /// @param rehearsalId Id of the operation that must already be done.
    function _requireTimelockRehearsed(address timelock, bytes32 rehearsalId) internal view {
        require(
            ProtocolTimelock(payable(timelock)).isOperationDone(rehearsalId),
            "rehearsal not executed: REHEARSAL_OPERATION_ID is not a done operation on this timelock"
        );
    }
}
