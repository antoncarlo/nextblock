// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";

/// @title InsuranceVaultUprBoundsTest
/// @author Anton Carlo Santoro
/// @notice Proves the UPR accounting is bounded (Morpho-style queue caps and
///         swap-and-pop pruning) while preserving the exact, conservative,
///         time-continuous UPR semantics: queue-full reverts, expired policies
///         and portfolios leave the iterated set, and the monotonic
///         totalPremiumReceived ceiling holds.
contract InsuranceVaultUprBoundsTest is Test {
    ProtocolRoles internal protocolRoles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolioRegistry;
    PolicyRegistry internal policyRegistry;
    ClaimReceipt internal claimReceipt;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;

    address internal admin = makeAddr("admin");
    address internal managerA = makeAddr("managerA");
    address internal cedant = makeAddr("cedant");
    address internal lp = makeAddr("institutionalLP");

    uint256 internal constant COVERAGE = 50_000e6;
    uint256 internal constant PREMIUM = 2_500e6;
    uint256 internal constant NINETY_DAYS = 90 days;

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));

        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC-BAL",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 50,
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);
        usdc.mint(admin, 100_000_000e6);
        vm.stopPrank();
    }

    function _newActivePolicy() internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = policyRegistry.registerPolicy(
            "Commercial Fire", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE, PREMIUM, NINETY_DAYS, cedant, 0
        );
        vm.prank(admin);
        policyRegistry.activatePolicy(pid);
        vm.prank(managerA);
        vault.addPolicy(pid, 1_000);
    }

    function _fund(uint256 pid, uint256 amount) internal {
        vm.startPrank(admin);
        usdc.approve(address(vault), amount);
        vault.depositPremium(pid, amount);
        vm.stopPrank();
    }

    // --- Bound enforcement ---

    function test_addPolicy_revertsWhenQueueFull() public {
        uint256 max = vault.MAX_ACTIVE_POLICIES();
        for (uint256 i = 0; i < max; i++) {
            _newActivePolicy();
        }
        // The next registration is fine; adding it to the vault must revert.
        vm.prank(cedant);
        uint256 overflow = policyRegistry.registerPolicy(
            "X", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE, PREMIUM, NINETY_DAYS, cedant, 0
        );
        vm.prank(admin);
        policyRegistry.activatePolicy(overflow);
        vm.prank(managerA);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PremiumQueueFull.selector, max));
        vault.addPolicy(overflow, 1_000);
    }

    /// @notice The cap is on CONCURRENTLY ACTIVE policies, not lifetime count:
    ///         64 active -> let them expire -> the expiry sweep frees the slots
    ///         -> a 65th (and beyond) policy is added successfully, while the
    ///         historical policyIds record keeps growing past the cap.
    function test_activeCap_rolloverBeyond64Lifetime() public {
        uint256 max = vault.MAX_ACTIVE_POLICIES();
        for (uint256 i = 0; i < max; i++) {
            _newActivePolicy();
        }
        // At capacity: a further add in the same window reverts (active cap).
        vm.prank(cedant);
        uint256 blocked = policyRegistry.registerPolicy(
            "blocked", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE, PREMIUM, NINETY_DAYS, cedant, 0
        );
        vm.prank(admin);
        policyRegistry.activatePolicy(blocked);
        vm.prank(managerA);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PremiumQueueFull.selector, max));
        vault.addPolicy(blocked, 1_000);

        // Let the 64 active policies expire; the next add triggers the sweep,
        // which prunes them and frees all the slots.
        vm.prank(admin);
        policyRegistry.advanceTime(NINETY_DAYS + 1);

        // Rolling over: add a full fresh batch beyond the lifetime count.
        for (uint256 i = 0; i < max; i++) {
            _newActivePolicy();
        }

        // Lifetime/historical record exceeded the cap; the active set did not.
        assertEq(vault.getPolicyIds().length, 2 * max, "historical record keeps all lifetime policies");
    }

    // --- Accumulator ---

    function test_totalPremiumReceived_accumulates() public {
        uint256 pid = _newActivePolicy();
        _fund(pid, PREMIUM);
        assertEq(vault.totalPremiumReceived(), PREMIUM, "policy premium accumulated");
        _fund(pid, PREMIUM);
        assertEq(vault.totalPremiumReceived(), 2 * PREMIUM, "second deposit accumulated");
    }

    /// @notice UPR is the conservative liability and never exceeds the monotonic
    ///         premium-received ceiling, at any point in the coverage window.
    function test_upr_neverExceedsPremiumReceived() public {
        uint256 pid = _newActivePolicy();
        _fund(pid, PREMIUM);

        (, uint256 upr0,,,,,,) = vault.getVaultAccounting();
        assertLe(upr0, vault.totalPremiumReceived(), "upr <= received at t0");
        assertApproxEqAbs(upr0, PREMIUM, 10, "fresh premium fully unearned");

        vm.prank(admin);
        policyRegistry.advanceTime(45 days);
        (, uint256 uprMid,,,,,,) = vault.getVaultAccounting();
        assertLe(uprMid, vault.totalPremiumReceived(), "upr <= received mid-window");
        assertLt(uprMid, upr0, "upr decays as premium is earned");
    }

    // --- Pruning: expired policy leaves the UPR set, UPR returns to zero ---

    function test_expiredPolicy_prunedAndUprZero() public {
        uint256 pid = _newActivePolicy();
        _fund(pid, PREMIUM);

        vm.prank(admin);
        policyRegistry.advanceTime(NINETY_DAYS + 1);

        // A state-changing call triggers the expiry sweep (prune).
        uint256 pid2 = _newActivePolicy();
        _fund(pid2, PREMIUM);

        // Expired policy contributes zero; only the fresh one remains unearned.
        (, uint256 upr,,,,,,) = vault.getVaultAccounting();
        assertApproxEqAbs(upr, PREMIUM, 10, "only the active policy's premium is unearned");
        assertLe(upr, vault.totalPremiumReceived(), "upr <= received after prune");
    }

    // --- Fuzz: UPR stays within [0, premiumReceived] across random time ---

    function testFuzz_uprBoundedAcrossTime(uint256 fundAmount, uint256 warpSecs) public {
        fundAmount = bound(fundAmount, 1e6, 1_000_000e6);
        warpSecs = bound(warpSecs, 0, 200 days);

        uint256 pid = _newActivePolicy();
        _fund(pid, fundAmount);

        vm.prank(admin);
        policyRegistry.advanceTime(warpSecs);

        (, uint256 upr,,,,,,) = vault.getVaultAccounting();
        assertLe(upr, vault.totalPremiumReceived(), "upr never exceeds received");
        assertLe(upr, fundAmount, "upr never exceeds the single funded premium");
    }
}
