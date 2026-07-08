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

/// @title NavShareOracleTest
/// @notice Prices nbUSDC collateral as USDC via the guarded NavOracle, against a
///         real InsuranceVault (18-dec shares) deployed through the full stack.
contract NavShareOracleTest is Test {
    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack deploy;
    InsuranceVault vault;
    NavOracle navOracle;
    ComplianceRegistry compliance;
    ProtocolRoles roles;
    MockUSDC usdc;
    address deployer;

    NavShareOracle oracle;

    address lp = makeAddr("institutionalLP");
    uint16 constant CONF = 9_000;
    bytes32 constant SRC = keccak256("braino-nav-report");

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        vault = deploy.vault();
        navOracle = deploy.navOracle();
        compliance = deploy.compliance();
        roles = deploy.protocolRoles();
        usdc = deploy.usdc();
        deployer = deploy.deployer(); // holds KYC_OPERATOR, ORACLE and SENTINEL in staging

        oracle = new NavShareOracle(address(navOracle), address(vault));
    }

    // --- Helpers ---

    function _onboardAndDeposit(address who, uint256 assets) internal returns (uint256 shares) {
        vm.startPrank(deployer);
        compliance.setWhitelist(who, true);
        compliance.setKycExpiry(who, uint64(block.timestamp + 365 days));
        vm.stopPrank();

        deal(address(usdc), who, assets);
        vm.startPrank(who);
        usdc.approve(address(vault), assets);
        shares = vault.deposit(assets, who);
        vm.stopPrank();
    }

    function _publishNav(uint256 nav) internal {
        vm.prank(deployer);
        navOracle.publishNav(address(vault), nav, CONF, SRC);
    }

    // --- Constructor ---

    function test_constructor_zeroArgs_revert() public {
        vm.expectRevert(NavShareOracle.NavShareOracle__InvalidParams.selector);
        new NavShareOracle(address(0), address(vault));

        vm.expectRevert(NavShareOracle.NavShareOracle__InvalidParams.selector);
        new NavShareOracle(address(navOracle), address(0));
    }

    function test_constructor_setsImmutables() public view {
        assertEq(address(oracle.navOracle()), address(navOracle));
        assertEq(oracle.vault(), address(vault));
    }

    // --- No supply ---

    function test_priceCollateral_noSupply_reverts() public {
        // Fresh vault, no deposits -> totalSupply == 0.
        _publishNav(100_000e6);
        vm.expectRevert(NavShareOracle.NavShareOracle__NoSupply.selector);
        oracle.priceCollateralUSDC(1e18);
    }

    // --- Happy path pricing ---

    function test_priceCollateral_fullSupply_equalsNav() public {
        _onboardAndDeposit(lp, 100_000e6);
        uint256 nav = 105_000e6; // vault appreciated
        _publishNav(nav);

        uint256 supply = vault.totalSupply();
        // Pricing the entire supply returns the whole NAV (exact, no rounding).
        assertEq(oracle.priceCollateralUSDC(supply), nav);
        // Zero shares -> zero value.
        assertEq(oracle.priceCollateralUSDC(0), 0);
    }

    function test_priceCollateral_soleDepositorSharesEqualNav() public {
        uint256 shares = _onboardAndDeposit(lp, 100_000e6);
        uint256 nav = 100_000e6;
        _publishNav(nav);
        // Sole depositor holds the entire supply -> their shares price to the whole NAV.
        assertEq(oracle.priceCollateralUSDC(shares), nav);
    }

    function test_navPerShare_matchesNavOverSupply() public {
        _onboardAndDeposit(lp, 100_000e6);
        uint256 nav = 100_000e6;
        _publishNav(nav);
        uint256 supply = vault.totalSupply();
        assertEq(oracle.navPerShare(), 1e18 * nav / supply);
    }

    // --- Guard propagation ---

    function test_priceCollateral_staleNav_reverts() public {
        _onboardAndDeposit(lp, 100_000e6);
        _publishNav(100_000e6);
        // Read supply BEFORE expectRevert: an external call in the arg position
        // would otherwise consume the cheatcode.
        uint256 supply = vault.totalSupply();
        vm.warp(block.timestamp + navOracle.maxStaleness() + 1);
        vm.expectPartialRevert(NavOracle.NavOracle__StaleNav.selector);
        oracle.priceCollateralUSDC(supply);
    }

    function test_priceCollateral_pausedFeed_reverts() public {
        _onboardAndDeposit(lp, 100_000e6);
        _publishNav(100_000e6);
        uint256 supply = vault.totalSupply();
        vm.prank(deployer); // SENTINEL
        navOracle.pauseFeed(address(vault));
        vm.expectPartialRevert(NavOracle.NavOracle__FeedPaused.selector);
        oracle.priceCollateralUSDC(supply);
    }

    function test_priceCollateral_noAttestation_reverts() public {
        _onboardAndDeposit(lp, 100_000e6);
        // No NAV ever published.
        uint256 supply = vault.totalSupply();
        vm.expectPartialRevert(NavOracle.NavOracle__NoAttestation.selector);
        oracle.priceCollateralUSDC(supply);
    }

    // --- Non-reverting view ---

    function test_tryPrice_invalidWhenNoNav() public {
        _onboardAndDeposit(lp, 100_000e6);
        (bool ok, uint256 v) = oracle.tryPriceCollateralUSDC(vault.totalSupply());
        assertFalse(ok);
        assertEq(v, 0);
    }

    function test_tryPrice_validAfterPublish() public {
        _onboardAndDeposit(lp, 100_000e6);
        _publishNav(100_000e6);
        (bool ok, uint256 v) = oracle.tryPriceCollateralUSDC(vault.totalSupply());
        assertTrue(ok);
        assertEq(v, 100_000e6);
    }

    // --- Fuzz ---

    function testFuzz_price_matchesFormula(uint256 navVal) public {
        uint256 shares = _onboardAndDeposit(lp, 100_000e6);
        navVal = bound(navVal, 1e6, 1_000_000_000e6);
        _publishNav(navVal);
        uint256 supply = vault.totalSupply();
        // mulDiv(supply, nav, supply) == nav exactly; sole depositor holds all supply.
        assertEq(oracle.priceCollateralUSDC(supply), navVal);
        assertEq(oracle.priceCollateralUSDC(shares), navVal);
    }
}
