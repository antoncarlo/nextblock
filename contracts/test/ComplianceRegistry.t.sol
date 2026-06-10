// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

/// @title ComplianceRegistryTest
/// @notice Phase 2.5 suite: KYC operator/sentinel gates, full eligibility matrix,
///         burn/mint transfer paths, KYC expiry boundaries (vm.warp) and events.
contract ComplianceRegistryTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;

    address public admin = makeAddr("admin");
    address public kycOperator = makeAddr("kycOperator");
    address public sentinel = makeAddr("sentinel");
    address public lp = makeAddr("institutionalLP");
    address public lp2 = makeAddr("institutionalLP2");
    address public attacker = makeAddr("attacker");

    uint64 public validExpiry;

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        compliance = new ComplianceRegistry(address(protocolRoles));

        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), kycOperator);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        vm.stopPrank();

        validExpiry = uint64(block.timestamp + 365 days);
    }

    // --- Helpers ---

    function _onboard(address user) internal {
        vm.startPrank(kycOperator);
        compliance.setWhitelist(user, true);
        compliance.setKycExpiry(user, validExpiry);
        compliance.setJurisdiction(user, 44); // e.g., Bahamas numeric code for demo
        vm.stopPrank();
    }

    // =========== ROLE GATES ===========

    function test_setWhitelist_onlyKycOperator() public {
        bytes32 kycRole = protocolRoles.KYC_OPERATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__UnauthorizedRole.selector, attacker, kycRole)
        );
        compliance.setWhitelist(lp, true);
    }

    function test_setJurisdiction_onlyKycOperator() public {
        bytes32 kycRole = protocolRoles.KYC_OPERATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__UnauthorizedRole.selector, attacker, kycRole)
        );
        compliance.setJurisdiction(lp, 44);
    }

    function test_setKycExpiry_onlyKycOperator() public {
        bytes32 kycRole = protocolRoles.KYC_OPERATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__UnauthorizedRole.selector, attacker, kycRole)
        );
        compliance.setKycExpiry(lp, validExpiry);
    }

    function test_setInvestorLimit_onlyKycOperator() public {
        bytes32 kycRole = protocolRoles.KYC_OPERATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__UnauthorizedRole.selector, attacker, kycRole)
        );
        compliance.setInvestorLimit(lp, 1_000_000e6);
    }

    function test_setBlocked_onlySentinel() public {
        bytes32 sentinelRole = protocolRoles.SENTINEL_ROLE();

        // KYC operator cannot block (role separation)
        vm.prank(kycOperator);
        vm.expectRevert(
            abi.encodeWithSelector(
                ComplianceRegistry.ComplianceRegistry__UnauthorizedRole.selector, kycOperator, sentinelRole
            )
        );
        compliance.setBlocked(lp, true);

        vm.prank(sentinel);
        compliance.setBlocked(lp, true);
        assertTrue(compliance.isBlocked(lp));
    }

    function test_setters_zeroAddress_revert() public {
        vm.startPrank(kycOperator);
        vm.expectRevert(ComplianceRegistry.ComplianceRegistry__InvalidParams.selector);
        compliance.setWhitelist(address(0), true);
        vm.expectRevert(ComplianceRegistry.ComplianceRegistry__InvalidParams.selector);
        compliance.setKycExpiry(address(0), validExpiry);
        vm.stopPrank();
    }

    function test_constructor_zeroRoles_reverts() public {
        vm.expectRevert(ComplianceRegistry.ComplianceRegistry__InvalidParams.selector);
        new ComplianceRegistry(address(0));
    }

    // =========== ELIGIBILITY MATRIX ===========

    function test_canReceive_default_false() public view {
        assertFalse(compliance.canReceive(lp));
    }

    function test_canReceive_fullyOnboarded_true() public {
        _onboard(lp);
        assertTrue(compliance.canReceive(lp));
    }

    function test_canReceive_whitelistedWithoutKyc_false() public {
        vm.prank(kycOperator);
        compliance.setWhitelist(lp, true);
        // kycExpiry = 0 < now -> not eligible
        assertFalse(compliance.canReceive(lp));
    }

    function test_canReceive_blocked_false() public {
        _onboard(lp);
        vm.prank(sentinel);
        compliance.setBlocked(lp, true);
        assertFalse(compliance.canReceive(lp));

        // Unblock restores eligibility
        vm.prank(sentinel);
        compliance.setBlocked(lp, false);
        assertTrue(compliance.canReceive(lp));
    }

    function test_canReceive_kycExpired_false() public {
        _onboard(lp);
        vm.warp(uint256(validExpiry) + 1);
        assertFalse(compliance.canReceive(lp));
    }

    function test_canReceive_dewhitelisted_false() public {
        _onboard(lp);
        vm.prank(kycOperator);
        compliance.setWhitelist(lp, false);
        assertFalse(compliance.canReceive(lp));
    }

    // =========== TRANSFER PATHS ===========

    function test_canTransfer_betweenEligible_true() public {
        _onboard(lp);
        _onboard(lp2);
        assertTrue(compliance.canTransfer(lp, lp2, 1_000e6));
    }

    function test_canTransfer_toNonWhitelisted_false() public {
        _onboard(lp);
        assertFalse(compliance.canTransfer(lp, lp2, 1_000e6));
    }

    function test_canTransfer_blockedSender_false() public {
        _onboard(lp);
        _onboard(lp2);
        vm.prank(sentinel);
        compliance.setBlocked(lp, true);
        assertFalse(compliance.canTransfer(lp, lp2, 1_000e6));
    }

    function test_canTransfer_burnPath_allowedForDewhitelisted() public {
        // De-whitelisted (but not blocked) LP must still be able to burn/redeem
        _onboard(lp);
        vm.prank(kycOperator);
        compliance.setWhitelist(lp, false);
        assertTrue(compliance.canTransfer(lp, address(0), 1_000e6));
    }

    function test_canTransfer_burnPath_blockedSender_false() public {
        _onboard(lp);
        vm.prank(sentinel);
        compliance.setBlocked(lp, true);
        assertFalse(compliance.canTransfer(lp, address(0), 1_000e6));
    }

    function test_canTransfer_mintPath_requiresEligibleReceiver() public {
        // from == address(0) is the mint path
        assertFalse(compliance.canTransfer(address(0), lp, 1_000e6));
        _onboard(lp);
        assertTrue(compliance.canTransfer(address(0), lp, 1_000e6));
    }

    // =========== REQUIRE* REVERTS (vault hook errors) ===========

    function test_requireCanReceive_specificErrors() public {
        // Not whitelisted
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__ReceiverNotWhitelisted.selector, lp)
        );
        compliance.requireCanReceive(lp);

        // Blocked takes precedence
        _onboard(lp);
        vm.prank(sentinel);
        compliance.setBlocked(lp, true);
        vm.expectRevert(abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__AddressBlocked.selector, lp));
        compliance.requireCanReceive(lp);

        // Expired KYC
        vm.prank(sentinel);
        compliance.setBlocked(lp, false);
        vm.warp(uint256(validExpiry) + 1);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__KycExpired.selector, lp, validExpiry)
        );
        compliance.requireCanReceive(lp);
    }

    function test_requireCanTransfer_blockedSender_reverts() public {
        _onboard(lp);
        _onboard(lp2);
        vm.prank(sentinel);
        compliance.setBlocked(lp, true);

        vm.expectRevert(abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__AddressBlocked.selector, lp));
        compliance.requireCanTransfer(lp, lp2, 1_000e6);
    }

    function test_requireCanTransfer_burnPath_noRevert() public {
        _onboard(lp);
        vm.prank(kycOperator);
        compliance.setWhitelist(lp, false);
        // Should not revert: burn path for non-blocked sender
        compliance.requireCanTransfer(lp, address(0), 1_000e6);
    }

    // =========== STORAGE / EVENTS ===========

    function test_investorLimit_storedAndExposed() public {
        vm.prank(kycOperator);
        vm.expectEmit(true, false, false, true);
        emit ComplianceRegistry.InvestorLimitUpdated(lp, 5_000_000e6);
        compliance.setInvestorLimit(lp, 5_000_000e6);

        assertEq(compliance.investorLimit(lp), 5_000_000e6);
        assertEq(compliance.investorLimit(lp2), 0); // 0 = unlimited
    }

    function test_events_emitted() public {
        vm.startPrank(kycOperator);

        vm.expectEmit(true, false, false, true);
        emit ComplianceRegistry.WhitelistUpdated(lp, true);
        compliance.setWhitelist(lp, true);

        vm.expectEmit(true, false, false, true);
        emit ComplianceRegistry.KycExpiryUpdated(lp, validExpiry);
        compliance.setKycExpiry(lp, validExpiry);

        vm.expectEmit(true, false, false, true);
        emit ComplianceRegistry.JurisdictionUpdated(lp, 44);
        compliance.setJurisdiction(lp, 44);

        vm.stopPrank();

        vm.prank(sentinel);
        vm.expectEmit(true, false, false, true);
        emit ComplianceRegistry.BlockedStatusUpdated(lp, true);
        compliance.setBlocked(lp, true);
    }

    function test_jurisdictionCode_stored() public {
        _onboard(lp);
        assertEq(compliance.jurisdictionCode(lp), 44);
    }

    // =========== FUZZ ===========

    function testFuzz_kycExpiryBoundary(uint64 expiry, uint64 warpTo) public {
        warpTo = uint64(bound(warpTo, block.timestamp, block.timestamp + 3650 days));

        vm.startPrank(kycOperator);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, expiry);
        vm.stopPrank();

        vm.warp(warpTo);

        // Eligible iff expiry >= now (and whitelisted, not blocked)
        assertEq(compliance.canReceive(lp), expiry >= warpTo);
    }

    function testFuzz_blockedAlwaysIneligible(uint64 expiry) public {
        vm.startPrank(kycOperator);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, expiry);
        vm.stopPrank();

        vm.prank(sentinel);
        compliance.setBlocked(lp, true);

        // Invariant: blocked address can never receive nor send, for any expiry
        assertFalse(compliance.canReceive(lp));
        assertFalse(compliance.canTransfer(lp, lp, 1));
        assertFalse(compliance.canTransfer(lp, address(0), 1));
    }
}
