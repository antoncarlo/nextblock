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

/// @title LendingMarketTest
/// @notice Isolated permissioned lending market (nbUSDC collateral / USDC loan).
///         Slice 1: lender side — supply/withdraw USDC, share accounting,
///         compliance gate and supply cap.
contract LendingMarketTest is Test {
    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
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

    address lender = makeAddr("usdcLender");
    address lender2 = makeAddr("usdcLender2");
    address feeRecipient = makeAddr("feeRecipient");

    uint256 constant SUPPLY_100K = 100_000e6;

    function setUp() public {
        vm.setEnv("PRIVATE_KEY", vm.toString(ANVIL_PK));
        vm.setEnv("WRITE_DEPLOYMENT_JSON", "false");
        deploy = new DeployStack();
        deploy.run();

        vault = deploy.vault();
        navOracle = deploy.navOracle();
        compliance = deploy.compliance();
        roles = deploy.protocolRoles();
        usdc = deploy.usdc();
        deployer = deploy.deployer();

        shareOracle = new NavShareOracle(address(navOracle), address(vault));
        market = new LendingMarket(_params(0));
    }

    // --- Helpers ---

    function _params(uint256 supplyCap) internal view returns (LendingMarket.MarketParams memory) {
        return LendingMarket.MarketParams({
            loanToken: address(usdc),
            collateralToken: address(vault),
            oracle: address(shareOracle),
            protocolRoles: address(roles),
            compliance: address(compliance),
            lltvBps: 7000,
            liqLtvBps: 8000,
            liqIncentiveBps: 500,
            protocolFeeBps: 1000,
            supplyCap: supplyCap,
            borrowCap: 0,
            feeRecipient: feeRecipient
        });
    }

    function _whitelist(address who) internal {
        vm.startPrank(deployer);
        compliance.setWhitelist(who, true);
        compliance.setKycExpiry(who, uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    function _supply(LendingMarket m, address who, uint256 amt) internal returns (uint256 shares) {
        _whitelist(who);
        deal(address(usdc), who, amt);
        vm.startPrank(who);
        usdc.approve(address(m), amt);
        shares = m.supply(amt);
        vm.stopPrank();
    }

    // --- Constructor ---

    function test_constructor_zeroAddress_reverts() public {
        LendingMarket.MarketParams memory p = _params(0);
        p.loanToken = address(0);
        vm.expectRevert(LendingMarket.LendingMarket__InvalidParams.selector);
        new LendingMarket(p);
    }

    function test_constructor_lltvAboveLiqLtv_reverts() public {
        LendingMarket.MarketParams memory p = _params(0);
        p.lltvBps = 8500; // > liqLtv 8000
        vm.expectRevert(LendingMarket.LendingMarket__InvalidParams.selector);
        new LendingMarket(p);
    }

    function test_constructor_setsParams() public view {
        assertEq(address(market.loanToken()), address(usdc));
        assertEq(address(market.collateralToken()), address(vault));
        assertEq(market.lltvBps(), 7000);
        assertEq(market.liqLtvBps(), 8000);
        assertEq(market.feeRecipient(), feeRecipient);
    }

    // --- Supply ---

    function test_supply_happyPath() public {
        uint256 shares = _supply(market, lender, SUPPLY_100K);
        assertEq(market.totalSupplyAssets(), SUPPLY_100K);
        assertEq(market.totalSupplyShares(), shares);
        assertEq(market.supplyShares(lender), shares);
        assertEq(usdc.balanceOf(address(market)), SUPPLY_100K);
        assertGt(shares, 0);
    }

    function test_supply_emitsEvent() public {
        _whitelist(lender);
        deal(address(usdc), lender, SUPPLY_100K);
        vm.startPrank(lender);
        usdc.approve(address(market), SUPPLY_100K);
        vm.expectEmit(true, false, false, false);
        emit LendingMarket.Supply(lender, SUPPLY_100K, 0); // shares not checked (data=false)
        market.supply(SUPPLY_100K);
        vm.stopPrank();
    }

    function test_supply_zero_reverts() public {
        _whitelist(lender);
        vm.prank(lender);
        vm.expectRevert(LendingMarket.LendingMarket__ZeroAmount.selector);
        market.supply(0);
    }

    function test_supply_notWhitelisted_reverts() public {
        deal(address(usdc), lender, SUPPLY_100K);
        vm.startPrank(lender);
        usdc.approve(address(market), SUPPLY_100K);
        vm.expectRevert(abi.encodeWithSelector(LendingMarket.LendingMarket__NotWhitelisted.selector, lender));
        market.supply(SUPPLY_100K);
        vm.stopPrank();
    }

    function test_supply_capExceeded_reverts() public {
        LendingMarket capped = new LendingMarket(_params(150_000e6));
        _supply(capped, lender, SUPPLY_100K); // 100k ok
        _whitelist(lender2);
        deal(address(usdc), lender2, SUPPLY_100K);
        vm.startPrank(lender2);
        usdc.approve(address(capped), SUPPLY_100K);
        // 100k + 100k = 200k > 150k cap
        vm.expectRevert(abi.encodeWithSelector(LendingMarket.LendingMarket__SupplyCapExceeded.selector, 150_000e6));
        capped.supply(SUPPLY_100K);
        vm.stopPrank();
    }

    function test_supply_multipleLenders_proportionalShares() public {
        uint256 s1 = _supply(market, lender, SUPPLY_100K);
        uint256 s2 = _supply(market, lender2, SUPPLY_100K);
        // Equal deposits with no interest accrued -> equal shares.
        assertEq(s1, s2);
        assertEq(market.totalSupplyShares(), s1 + s2);
        assertEq(market.totalSupplyAssets(), 2 * SUPPLY_100K);
    }

    // --- Withdraw ---

    function test_withdraw_happyPath() public {
        _supply(market, lender, SUPPLY_100K);
        uint256 balBefore = usdc.balanceOf(lender);
        vm.prank(lender);
        market.withdraw(40_000e6, lender);
        assertEq(usdc.balanceOf(lender), balBefore + 40_000e6);
        assertEq(market.totalSupplyAssets(), 60_000e6);
        assertEq(usdc.balanceOf(address(market)), 60_000e6);
    }

    function test_withdraw_all() public {
        _supply(market, lender, SUPPLY_100K);
        vm.prank(lender);
        market.withdraw(SUPPLY_100K, lender);
        assertEq(market.supplyShares(lender), 0);
        assertEq(market.totalSupplyAssets(), 0);
        assertEq(usdc.balanceOf(lender), SUPPLY_100K);
    }

    function test_withdraw_zero_reverts() public {
        _supply(market, lender, SUPPLY_100K);
        vm.prank(lender);
        vm.expectRevert(LendingMarket.LendingMarket__ZeroAmount.selector);
        market.withdraw(0, lender);
    }

    function test_withdraw_moreThanSupplied_reverts() public {
        _supply(market, lender, SUPPLY_100K);
        vm.prank(lender);
        vm.expectRevert(LendingMarket.LendingMarket__InsufficientShares.selector);
        market.withdraw(SUPPLY_100K + 1, lender);
    }

    // --- Fuzz ---

    function testFuzz_supplyWithdraw_roundtrip(uint256 amt) public {
        amt = bound(amt, 1e6, 100_000_000e6);
        _supply(market, lender, amt);
        uint256 balBefore = usdc.balanceOf(lender);
        vm.prank(lender);
        market.withdraw(amt, lender);
        // Lender recovers exactly what was supplied (no interest, sole lender).
        assertEq(usdc.balanceOf(lender), balBefore + amt);
        assertEq(market.totalSupplyAssets(), 0);
    }
}
