// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "../src/ProtocolRoles.sol";
import {ProtocolTimelock} from "../src/ProtocolTimelock.sol";
import {AIAssessor} from "../src/AIAssessor.sol";

/// @title ProtocolTimelockTest
/// @author Anton Carlo Santoro
/// @notice Governance timelock for risk-increasing actions: constructor guards,
///         role wiring, schedule/execute/cancel lifecycle and the OWNER_ROLE
///         migration path away from a single EOA.
contract ProtocolTimelockTest is Test, ProtocolRoleConstants {
    uint256 internal constant DELAY = 1 days;
    bytes32 internal constant NO_PREDECESSOR = bytes32(0);
    bytes32 internal constant SALT = bytes32(0);

    address internal safe = makeAddr("safe"); // proposer + canceller (future Safe multisig)
    address internal executor = makeAddr("executor"); // operational executor
    address internal stranger = makeAddr("stranger");
    address internal newKycOperator = makeAddr("newKycOperator");

    ProtocolRoles internal roles;
    ProtocolTimelock internal timelock;
    AIAssessor internal assessor;

    function setUp() public {
        roles = new ProtocolRoles(address(this));
        timelock = _newTimelock(DELAY);
        assessor = new AIAssessor(address(roles));

        // Governance integration: the timelock holds OWNER_ROLE so every
        // OWNER-gated module action must flow through schedule -> delay -> execute.
        roles.grantRole(OWNER_ROLE, address(timelock));
    }

    function _newTimelock(uint256 minDelay) internal returns (ProtocolTimelock) {
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = executor;
        // admin = address(0): the timelock is self-administered from genesis.
        return new ProtocolTimelock(minDelay, proposers, executors, address(0));
    }

    // --- Constructor guards ---

    function test_Constructor_RevertWhen_DelayBelowFloor() public {
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = executor;

        uint256 tooShort = timelock.MIN_ENFORCED_DELAY() - 1;
        vm.expectRevert(
            abi.encodeWithSelector(
                ProtocolTimelock.ProtocolTimelock__DelayTooShort.selector, tooShort, timelock.MIN_ENFORCED_DELAY()
            )
        );
        new ProtocolTimelock(tooShort, proposers, executors, address(0));
    }

    function test_Constructor_RevertWhen_NoProposers() public {
        address[] memory none = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = executor;

        vm.expectRevert(ProtocolTimelock.ProtocolTimelock__EmptyProposers.selector);
        new ProtocolTimelock(DELAY, none, executors, address(0));
    }

    function test_Constructor_RevertWhen_NoExecutors() public {
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory none = new address[](0);

        vm.expectRevert(ProtocolTimelock.ProtocolTimelock__EmptyExecutors.selector);
        new ProtocolTimelock(DELAY, proposers, none, address(0));
    }

    function test_Constructor_WiresTimelockRoles() public view {
        assertTrue(timelock.hasRole(timelock.PROPOSER_ROLE(), safe), "safe must propose");
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), safe), "safe must cancel");
        assertTrue(timelock.hasRole(timelock.EXECUTOR_ROLE(), executor), "executor must execute");
        // Self-administered: the timelock is its own admin, no external admin EOA.
        assertTrue(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)), "self admin");
        assertEq(timelock.getMinDelay(), DELAY, "min delay");
    }

    // --- Schedule / execute lifecycle ---

    function _scheduleGrantKycOperator() internal returns (address target, bytes memory data) {
        target = address(roles);
        data = abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, newKycOperator));
        vm.prank(safe);
        timelock.schedule(target, 0, data, NO_PREDECESSOR, SALT, DELAY);
    }

    function test_GovernanceFlow_GrantRoleThroughTimelock() public {
        (address target, bytes memory data) = _scheduleGrantKycOperator();

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.execute(target, 0, data, NO_PREDECESSOR, SALT);

        assertTrue(roles.hasRole(KYC_OPERATOR_ROLE, newKycOperator), "role granted through timelock");
    }

    function test_GovernanceFlow_ModuleConfigThroughTimelock() public {
        uint16 newThreshold = 6500; // within module bounds [5000, 10000] bps
        // Direct call without OWNER_ROLE must revert.
        vm.prank(stranger);
        vm.expectRevert();
        assessor.setAnomalyThreshold(newThreshold);

        bytes memory data = abi.encodeCall(AIAssessor.setAnomalyThreshold, (newThreshold));
        vm.prank(safe);
        timelock.schedule(address(assessor), 0, data, NO_PREDECESSOR, SALT, DELAY);

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.execute(address(assessor), 0, data, NO_PREDECESSOR, SALT);

        assertEq(assessor.anomalyThresholdBps(), newThreshold, "module config applied through timelock");
    }

    function test_Execute_RevertWhen_DelayNotElapsed() public {
        (address target, bytes memory data) = _scheduleGrantKycOperator();

        vm.warp(block.timestamp + DELAY - 1);
        vm.prank(executor);
        vm.expectRevert();
        timelock.execute(target, 0, data, NO_PREDECESSOR, SALT);
    }

    function test_Schedule_RevertWhen_DelayBelowMin() public {
        bytes memory data = abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, newKycOperator));
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(TimelockController.TimelockInsufficientDelay.selector, DELAY - 1, DELAY));
        timelock.schedule(address(roles), 0, data, NO_PREDECESSOR, SALT, DELAY - 1);
    }

    function test_Schedule_RevertWhen_NotProposer() public {
        bytes memory data = abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, newKycOperator));
        vm.prank(stranger);
        vm.expectRevert();
        timelock.schedule(address(roles), 0, data, NO_PREDECESSOR, SALT, DELAY);
    }

    function test_Execute_RevertWhen_NotExecutor() public {
        (address target, bytes memory data) = _scheduleGrantKycOperator();

        vm.warp(block.timestamp + DELAY);
        vm.prank(stranger);
        vm.expectRevert();
        timelock.execute(target, 0, data, NO_PREDECESSOR, SALT);
    }

    function test_Cancel_ByCanceller() public {
        (address target, bytes memory data) = _scheduleGrantKycOperator();
        bytes32 id = timelock.hashOperation(target, 0, data, NO_PREDECESSOR, SALT);

        vm.prank(safe);
        timelock.cancel(id);

        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        vm.expectRevert();
        timelock.execute(target, 0, data, NO_PREDECESSOR, SALT);
        assertFalse(roles.hasRole(KYC_OPERATOR_ROLE, newKycOperator), "cancelled op must not apply");
    }

    // --- EOA migration path ---

    function test_Migration_EOALosesOwnerPowers() public {
        // Simulate the governance migration: hand DEFAULT_ADMIN_ROLE to the
        // timelock, then the deployer EOA renounces everything.
        roles.grantRole(roles.DEFAULT_ADMIN_ROLE(), address(timelock));
        roles.renounceRole(OWNER_ROLE, address(this));
        roles.renounceRole(roles.DEFAULT_ADMIN_ROLE(), address(this));

        // Old EOA can no longer administer roles directly.
        vm.expectRevert();
        roles.grantRole(KYC_OPERATOR_ROLE, newKycOperator);

        // The timelock path still works end-to-end.
        (address target, bytes memory data) = _scheduleGrantKycOperator();
        vm.warp(block.timestamp + DELAY);
        vm.prank(executor);
        timelock.execute(target, 0, data, NO_PREDECESSOR, SALT);
        assertTrue(roles.hasRole(KYC_OPERATOR_ROLE, newKycOperator), "timelock governs after migration");
    }

    // --- Fuzz ---

    function testFuzz_Schedule_DelayAtOrAboveMin(uint256 delay) public {
        delay = bound(delay, DELAY, 30 days);
        bytes memory data = abi.encodeCall(IAccessControl.grantRole, (KYC_OPERATOR_ROLE, newKycOperator));

        vm.prank(safe);
        timelock.schedule(address(roles), 0, data, NO_PREDECESSOR, SALT, delay);

        vm.warp(block.timestamp + delay);
        vm.prank(executor);
        timelock.execute(address(roles), 0, data, NO_PREDECESSOR, SALT);
        assertTrue(roles.hasRole(KYC_OPERATOR_ROLE, newKycOperator));
    }
}
