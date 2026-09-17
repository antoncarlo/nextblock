// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {NavOracle} from "../src/NavOracle.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {NavShareOracle} from "../src/lending/NavShareOracle.sol";
import {LendingMarket} from "../src/lending/LendingMarket.sol";

/// @title LiquidationBrickFuzz
/// @author Anton Carlo Santoro
/// @notice Fuzzes the corrective NAV to map how wide the unliquidatable band is.
///
///         The stated property is the one a lending market has to keep: if a
///         position is unhealthy and still holds collateral, a funded liquidator
///         must be able to close it. Anything else leaves bad debt on the
///         lenders' books with no way to realise it.
///
///         The fuzzer is pointed at the corrective NAV because that is the only
///         free variable after a default — everything else (collateral, debt,
///         incentive, threshold) is fixed by the position.
///
///         HISTORY: the property used to fail at exactly `nav == 0`, where
///         `mulDiv` panicked on a zero denominator and the position became
///         permanently unliquidatable. The band widened below zero whenever
///         rounding took the collateral to zero, i.e. `shares * nav <
///         totalSupply`; with a dominant holder, as here, zero was the only
///         point. `liquidate` now branches on a zero collateral value, seizes
///         everything and socialises the residual, so the range includes zero
///         and the property is universal.
///
///         This is a live regression guard: it must keep passing, and it fails
///         the day any corrective NAV leaves a bad loan unclosable.
contract LiquidationBrickFuzzTest is Test {
    /// @dev Anvil default key #0 — publicly known testnet placeholder.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack deploy;
    InsuranceVault vault;
    NavOracle navOracle;
    ComplianceRegistry compliance;
    ProtocolRoles roles;
    MockUSDC usdc;
    address deployer;

    NavShareOracle shareOracle;
    LendingMarket market;

    address lender = makeAddr("lender");
    address borrower = makeAddr("borrower");
    address liquidator = makeAddr("liquidator");
    address feeRecipient = makeAddr("feeRecipient");

    uint256 constant LENDER_SUPPLY = 100_000e6;
    uint256 constant COLLATERAL_USDC = 100_000e6;
    uint256 constant HEALTHY_NAV = 100_000e6;
    uint256 constant BORROW = 70_000e6;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        vault = deploy.vault();
        navOracle = deploy.navOracle();
        compliance = deploy.compliance();
        roles = deploy.protocolRoles();
        usdc = deploy.usdc();
        deployer = deploy.deployer();

        shareOracle = new NavShareOracle(address(navOracle), address(vault));
        market = new LendingMarket(
            LendingMarket.MarketParams({
                loanToken: address(usdc),
                collateralToken: address(vault),
                oracle: address(shareOracle),
                protocolRoles: address(roles),
                compliance: address(compliance),
                lltvBps: 7000,
                liqLtvBps: 8000,
                liqIncentiveBps: 500,
                protocolFeeBps: 0,
                supplyCap: 0,
                borrowCap: 0,
                feeRecipient: feeRecipient,
                baseRatePerSecondWad: 0,
                slopePerSecondWad: 0
            })
        );

        vm.prank(deployer);
        compliance.setApprovedVenue(address(market), true);
        _whitelist(lender);
        _whitelist(borrower);
        _whitelist(liquidator);

        _openLeveragedPosition();
    }

    /// @notice An unhealthy, collateralised position must always be liquidatable.
    /// @param correctiveNav The NAV the oracle settles on after the default.
    function testFuzz_unhealthyPositionIsAlwaysLiquidatable(uint256 correctiveNav) public {
        // Only corrections that actually put the position underwater are in
        // scope: above this the loan is still healthy and refusing to liquidate
        // is the correct behaviour, not a defect.
        // Zero is now INCLUDED. It used to be excluded because it was the known
        // defect; since `liquidate` guards the zero denominator the property is
        // universal over the whole range, which is what makes this a real fuzz
        // rather than a fuzz around a hole.
        correctiveNav = bound(correctiveNav, 0, 80_000e6);

        _collapseNavTo(correctiveNav);

        // Precondition for the property: unhealthy, and collateral still posted.
        if (market.isHealthy(borrower)) return;
        if (market.collateralOf(borrower) == 0) return;

        deal(address(usdc), liquidator, LENDER_SUPPLY);
        vm.startPrank(liquidator);
        usdc.approve(address(market), type(uint256).max);

        // The property. A revert here means lenders are stuck with bad debt they
        // can never realise, at a NAV the protocol itself chose to publish.
        try market.liquidate(borrower, type(uint256).max) returns (uint256, uint256 seized) {
            assertGt(seized, 0, "liquidation must seize something");
            // Asserting on DEBT, not collateral: repaying the whole debt can
            // legitimately leave collateral with the borrower, so a full
            // close-out is not the property. Clearing the loan is.
            assertEq(market.borrowAssetsOf(borrower), 0, "and must clear the bad loan");
        } catch {
            uint256 collValue = shareOracle.priceCollateralUSDC(market.collateralOf(borrower));
            emit log_named_uint("corrective NAV that bricks liquidation", correctiveNav);
            emit log_named_uint("collateral value at that NAV", collValue);
            assertTrue(false, "unhealthy collateralised position could not be liquidated");
        }
        vm.stopPrank();
    }

    // --- Helpers ---

    function _whitelist(address who) internal {
        vm.startPrank(deployer);
        compliance.setWhitelist(who, true);
        compliance.setKycExpiry(who, uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    function _openLeveragedPosition() internal {
        deal(address(usdc), lender, LENDER_SUPPLY);
        vm.startPrank(lender);
        usdc.approve(address(market), LENDER_SUPPLY);
        market.supply(LENDER_SUPPLY);
        vm.stopPrank();

        deal(address(usdc), borrower, COLLATERAL_USDC);
        vm.startPrank(borrower);
        usdc.approve(address(vault), COLLATERAL_USDC);
        uint256 shares = vault.deposit(COLLATERAL_USDC, borrower);
        vault.approve(address(market), shares);
        market.depositCollateral(shares);
        vm.stopPrank();

        vm.prank(deployer);
        navOracle.publishNav(address(vault), HEALTHY_NAV, 9000, keccak256("healthy"));

        vm.prank(borrower);
        market.borrow(BORROW, borrower);
    }

    function _collapseNavTo(uint256 nav) internal {
        vm.startPrank(deployer);
        navOracle.publishNav(address(vault), nav, 9000, keccak256("correction-pauses"));
        navOracle.acknowledgeDeviation(address(vault));
        navOracle.unpauseFeed(address(vault));
        navOracle.publishNav(address(vault), nav, 9000, keccak256("correction-applied"));
        vm.stopPrank();
    }
}
