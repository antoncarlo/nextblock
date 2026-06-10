// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";

contract PolicyRegistryTest is Test {
    PolicyRegistry public registry;
    ProtocolRoles public protocolRoles;
    address public admin = makeAddr("admin");
    address public notAdmin = makeAddr("notAdmin");
    address public insurer = makeAddr("insurer");

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        registry = new PolicyRegistry(address(protocolRoles));

        // Admin acts as cedant (registers policies) and curator (activates) in tests.
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        vm.stopPrank();
    }

    // --- Time Management ---

    function test_currentTime() public view {
        assertEq(registry.currentTime(), block.timestamp);
    }

    function test_advanceTime() public {
        vm.prank(admin);
        registry.advanceTime(30 days);
        assertEq(registry.currentTime(), block.timestamp + 30 days);
        assertEq(registry.timeOffset(), 30 days);
    }

    function test_advanceTime_cumulative() public {
        vm.prank(admin);
        registry.advanceTime(10 days);
        vm.prank(admin);
        registry.advanceTime(20 days);
        assertEq(registry.currentTime(), block.timestamp + 30 days);
    }

    function test_advanceTime_onlyOwnerRole() public {
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(notAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, notAdmin, ownerRole)
        );
        registry.advanceTime(30 days);
    }

    function test_advanceTime_event() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit PolicyRegistry.TimeAdvanced(block.timestamp + 30 days, 30 days);
        registry.advanceTime(30 days);
    }

    // --- Policy Registration ---

    function test_registerPolicy() public {
        vm.prank(admin);
        uint256 policyId = registry.registerPolicy(
            "BTC Price Protection",
            PolicyRegistry.VerificationType.ON_CHAIN,
            50_000e6, // coverage
            2_500e6, // premium
            90 days, // duration
            insurer,
            80_000e8 // threshold
        );

        assertEq(policyId, 0);
        PolicyRegistry.Policy memory policy = registry.getPolicy(0);
        assertEq(policy.id, 0);
        assertEq(policy.coverageAmount, 50_000e6);
        assertEq(policy.premiumAmount, 2_500e6);
        assertEq(policy.duration, 90 days);
        assertEq(policy.insurer, insurer);
        assertEq(policy.triggerThreshold, 80_000e8);
        assertEq(uint8(policy.status), uint8(PolicyRegistry.PolicyStatus.REGISTERED));
        assertEq(uint8(policy.verificationType), uint8(PolicyRegistry.VerificationType.ON_CHAIN));
    }

    function test_registerPolicy_incrementsId() public {
        vm.startPrank(admin);
        uint256 id0 = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        uint256 id1 = registry.registerPolicy(
            "P2", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, 15_000e6, 1_200e6, 60 days, insurer, 0
        );
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(registry.getPolicyCount(), 2);
    }

    function test_registerPolicy_onlyAuthorizedCedant() public {
        bytes32 cedantRole = protocolRoles.AUTHORIZED_CEDANT_ROLE();
        vm.prank(notAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, notAdmin, cedantRole)
        );
        registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
    }

    function test_activatePolicy_onlyUnderwritingCurator() public {
        vm.prank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );

        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(notAdmin);
        vm.expectRevert(
            abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__UnauthorizedRole.selector, notAdmin, curatorRole)
        );
        registry.activatePolicy(pid);
    }

    function test_constructor_zeroRoles_reverts() public {
        vm.expectRevert(PolicyRegistry.PolicyRegistry__InvalidParams.selector);
        new PolicyRegistry(address(0));
    }

    function test_registerPolicy_invalidParams() public {
        vm.startPrank(admin);

        // Zero coverage
        vm.expectRevert(PolicyRegistry.PolicyRegistry__InvalidParams.selector);
        registry.registerPolicy("P1", PolicyRegistry.VerificationType.ON_CHAIN, 0, 2_500e6, 90 days, insurer, 0);

        // Zero premium
        vm.expectRevert(PolicyRegistry.PolicyRegistry__InvalidParams.selector);
        registry.registerPolicy("P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 0, 90 days, insurer, 0);

        // Zero duration
        vm.expectRevert(PolicyRegistry.PolicyRegistry__InvalidParams.selector);
        registry.registerPolicy("P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 0, insurer, 0);

        // Zero insurer
        vm.expectRevert(PolicyRegistry.PolicyRegistry__InvalidParams.selector);
        registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, address(0), 0
        );

        vm.stopPrank();
    }

    // --- Policy Activation ---

    function test_activatePolicy() public {
        vm.startPrank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        registry.activatePolicy(pid);
        vm.stopPrank();

        PolicyRegistry.Policy memory policy = registry.getPolicy(pid);
        assertEq(uint8(policy.status), uint8(PolicyRegistry.PolicyStatus.ACTIVE));
        assertEq(policy.startTime, block.timestamp);
    }

    function test_activatePolicy_notRegistered() public {
        vm.startPrank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        registry.activatePolicy(pid);

        // Try to activate again (already ACTIVE)
        vm.expectRevert(
            abi.encodeWithSelector(
                PolicyRegistry.PolicyRegistry__InvalidStatus.selector,
                pid,
                PolicyRegistry.PolicyStatus.ACTIVE,
                PolicyRegistry.PolicyStatus.REGISTERED
            )
        );
        registry.activatePolicy(pid);
        vm.stopPrank();
    }

    function test_activatePolicy_notFound() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(PolicyRegistry.PolicyRegistry__PolicyNotFound.selector, 999));
        registry.activatePolicy(999);
    }

    // --- Policy Expiry ---

    function test_isPolicyExpired_notExpired() public {
        vm.startPrank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        registry.activatePolicy(pid);
        vm.stopPrank();

        assertFalse(registry.isPolicyExpired(pid));
    }

    function test_isPolicyExpired_expired() public {
        vm.startPrank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        registry.activatePolicy(pid);
        registry.advanceTime(91 days);
        vm.stopPrank();

        assertTrue(registry.isPolicyExpired(pid));
    }

    function test_getRemainingDuration() public {
        vm.startPrank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        registry.activatePolicy(pid);
        registry.advanceTime(30 days);
        vm.stopPrank();

        assertEq(registry.getRemainingDuration(pid), 60 days);
    }

    function test_getRemainingDuration_expired() public {
        vm.startPrank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );
        registry.activatePolicy(pid);
        registry.advanceTime(100 days);
        vm.stopPrank();

        assertEq(registry.getRemainingDuration(pid), 0);
    }

    function test_getRemainingDuration_notActive() public {
        vm.prank(admin);
        uint256 pid = registry.registerPolicy(
            "P1", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8
        );

        // Not yet activated
        assertEq(registry.getRemainingDuration(pid), 0);
    }
}
