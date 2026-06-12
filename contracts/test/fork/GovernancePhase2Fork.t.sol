// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "../../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../../src/ProtocolTimelock.sol";

/// @title GovernancePhase2ForkTest
/// @author Anton Carlo Santoro
/// @notice Fork-mode rehearsal of Governance Phase 2 against the REAL Base
///         Sepolia staging state (addresses read from the canonical address
///         book). Everything happens inside the fork's memory: `forge test`
///         has no broadcast path by construction, so no transaction can ever
///         reach the live chain from here.
/// @dev CI-safe: when BASE_SEPOLIA_RPC_URL is not set, every test is skipped
///      (CI defines no secrets/env). To run locally:
///
///        BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
///          forge test --match-path "test/fork/*" -vvv
///
///      The fork is pinned to block 42_720_000 (after the phase 1 governance
///      broadcast at blocks 42_710_589..593) for reproducibility.
contract GovernancePhase2ForkTest is Test, ProtocolRoleConstants {
    uint256 internal constant PINNED_BLOCK = 42_720_000;
    bytes32 internal constant NO_PRED = bytes32(0);
    bytes32 internal constant SALT = bytes32(0);

    ProtocolRoles internal roles;
    ProtocolTimelock internal timelock;
    address internal safe;
    address internal deployer;
    bool internal forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // tests will self-skip

        vm.createSelectFork(rpc, PINNED_BLOCK);
        forked = true;

        string memory book = vm.readFile("deployments/84532-staging.json");
        roles = ProtocolRoles(vm.parseJsonAddress(book, ".protocolRoles"));
        timelock = ProtocolTimelock(payable(vm.parseJsonAddress(book, ".protocolTimelock")));
        safe = vm.parseJsonAddress(book, ".safe");
        deployer = vm.parseJsonAddress(book, ".deployer");
    }

    modifier onlyForked() {
        if (!forked) {
            vm.skip(true);
        }
        _;
    }

    /// Invariants that must hold BOTH before and after the real Phase 2.
    function test_Fork_GovernanceInvariants() public onlyForked {
        assertTrue(roles.hasRole(OWNER_ROLE, address(timelock)), "timelock owner");
        assertTrue(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock)), "timelock admin");
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), safe), "safe proposer");
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), safe), "safe executor");
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), safe), "safe canceller");
        assertTrue(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)), "self admin");
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer), "deployer not tl admin");
        assertGe(timelock.getMinDelay(), 3600, "min delay floor");
        assertGe(timelock.getMinDelay(), timelock.MIN_ENFORCED_DELAY(), "floor respected");
    }

    /// Full Phase 2 rehearsed inside the fork: timelocked grant (Step 1),
    /// deployer renounce (Stage B) and post-handover control, against the
    /// real deployed bytecode and storage.
    function test_Fork_FullPhase2Rehearsal() public onlyForked {
        address newOperator = makeAddr("forkOperator");
        // Hoisted: an external call inside the argument list would consume
        // the prank and make schedule run as the default sender.
        uint256 delay_ = timelock.getMinDelay();

        // Step 1: rehearsal op through the real timelock, impersonating the Safe.
        bytes memory grantData = abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, newOperator));
        vm.prank(safe);
        timelock.schedule(address(roles), 0, grantData, NO_PRED, SALT, delay_);
        vm.warp(block.timestamp + delay_);
        vm.prank(safe);
        timelock.execute(address(roles), 0, grantData, NO_PRED, SALT);
        assertTrue(roles.hasRole(KYC_OPERATOR_ROLE, newOperator), "fork rehearsal grant");

        // Stage B (fork-local only): deployer renounces if it still holds roles.
        if (roles.hasRole(OWNER_ROLE, deployer)) {
            vm.startPrank(deployer);
            roles.renounceRole(OWNER_ROLE, deployer);
            roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), deployer);
            vm.stopPrank();
        }
        assertFalse(roles.hasRole(OWNER_ROLE, deployer), "deployer owner removed");
        assertFalse(roles.hasRole(roles.DEFAULT_ADMIN_ROLE(), deployer), "deployer admin removed");

        // Irreversibility for the EOA on the real contract.
        vm.prank(deployer);
        vm.expectRevert();
        roles.grantRole(OWNER_ROLE, deployer);

        // Post-handover: the timelock still governs (revoke the rehearsal grant).
        bytes memory revokeData = abi.encodeCall(IAccessControl.revokeRole, (KYC_OPERATOR_ROLE, newOperator));
        vm.prank(safe);
        timelock.schedule(address(roles), 0, revokeData, NO_PRED, SALT, delay_);
        vm.warp(block.timestamp + delay_);
        vm.prank(safe);
        timelock.execute(address(roles), 0, revokeData, NO_PRED, SALT);
        assertFalse(roles.hasRole(KYC_OPERATOR_ROLE, newOperator), "timelock governs post-handover");
    }
}
