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
    address borrower = makeAddr("borrower");
    address feeRecipient = makeAddr("feeRecipient");

    uint256 constant SUPPLY_100K = 100_000e6;
    uint256 constant COLLATERAL_USDC = 100_000e6;

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
            feeRecipient: feeRecipient,
            baseRatePerSecondWad: 0,
            slopePerSecondWad: 1e10 // ~31.5% APR at full utilization
        });
    }

    function _publishNav(uint256 nav) internal {
        vm.prank(deployer);
        navOracle.publishNav(address(vault), nav, 9000, keccak256("nav"));
    }

    /// @dev Full borrow-enabling setup: lender liquidity, borrower collateral, NAV.
    function _enableBorrow(uint256 supplyAmt, uint256 collUsdc, uint256 nav) internal returns (uint256 collShares) {
        _supply(market, lender, supplyAmt);
        collShares = _giveCollateral(borrower, collUsdc);
        _approveVenue();
        _postCollateral(borrower, collShares);
        _publishNav(nav);
    }

    function _collateralValue(address who) internal view returns (uint256) {
        return shareOracle.priceCollateralUSDC(market.collateralOf(who));
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

    /// @dev Approve the market as a venue allowed to custody nbUSDC.
    function _approveVenue() internal {
        vm.prank(deployer); // KYC_OPERATOR
        compliance.setApprovedVenue(address(market), true);
    }

    /// @dev Mint nbUSDC collateral to `who` by depositing USDC into the vault.
    function _giveCollateral(address who, uint256 usdcAmt) internal returns (uint256 shares) {
        _whitelist(who);
        deal(address(usdc), who, usdcAmt);
        vm.startPrank(who);
        usdc.approve(address(vault), usdcAmt);
        shares = vault.deposit(usdcAmt, who);
        vm.stopPrank();
    }

    function _postCollateral(address who, uint256 shares) internal {
        vm.startPrank(who);
        vault.approve(address(market), shares);
        market.depositCollateral(shares);
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

    // --- Collateral (slice 2) ---

    function test_depositCollateral_happyPath() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        _postCollateral(borrower, shares);

        assertEq(market.collateralOf(borrower), shares);
        assertEq(market.totalCollateral(), shares);
        assertEq(vault.balanceOf(address(market)), shares);
        assertEq(vault.balanceOf(borrower), 0);
    }

    function test_depositCollateral_emitsEvent() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        vm.startPrank(borrower);
        vault.approve(address(market), shares);
        vm.expectEmit(true, false, false, true);
        emit LendingMarket.CollateralDeposited(borrower, shares);
        market.depositCollateral(shares);
        vm.stopPrank();
    }

    function test_depositCollateral_zero_reverts() public {
        _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        vm.prank(borrower);
        vm.expectRevert(LendingMarket.LendingMarket__ZeroAmount.selector);
        market.depositCollateral(0);
    }

    function test_depositCollateral_marketNotApprovedVenue_reverts() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        // Venue NOT approved -> the vault transfer hook rejects custody by the market.
        vm.startPrank(borrower);
        vault.approve(address(market), shares);
        vm.expectPartialRevert(ComplianceRegistry.ComplianceRegistry__ReceiverNotWhitelisted.selector);
        market.depositCollateral(shares);
        vm.stopPrank();
    }

    function test_depositCollateral_notWhitelistedBorrower_reverts() public {
        // borrower holds no shares and is not whitelisted
        _approveVenue();
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(LendingMarket.LendingMarket__NotWhitelisted.selector, borrower));
        market.depositCollateral(1e18);
    }

    function test_withdrawCollateral_happyPath() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        _postCollateral(borrower, shares);

        uint256 half = shares / 2;
        vm.prank(borrower);
        market.withdrawCollateral(half, borrower);

        assertEq(market.collateralOf(borrower), shares - half);
        assertEq(market.totalCollateral(), shares - half);
        assertEq(vault.balanceOf(borrower), half);
    }

    function test_withdrawCollateral_all() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        _postCollateral(borrower, shares);

        vm.prank(borrower);
        market.withdrawCollateral(shares, borrower);
        assertEq(market.collateralOf(borrower), 0);
        assertEq(vault.balanceOf(borrower), shares);
    }

    function test_withdrawCollateral_moreThanPosted_reverts() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        _postCollateral(borrower, shares);

        vm.prank(borrower);
        vm.expectRevert(LendingMarket.LendingMarket__InsufficientCollateral.selector);
        market.withdrawCollateral(shares + 1, borrower);
    }

    function test_withdrawCollateral_toNonWhitelisted_reverts() public {
        uint256 shares = _giveCollateral(borrower, COLLATERAL_USDC);
        _approveVenue();
        _postCollateral(borrower, shares);

        // Sending restricted shares to a non-whitelisted address is rejected by the vault hook.
        vm.prank(borrower);
        vm.expectPartialRevert(ComplianceRegistry.ComplianceRegistry__ReceiverNotWhitelisted.selector);
        market.withdrawCollateral(shares, makeAddr("nonWhitelisted"));
    }

    function testFuzz_collateral_roundtrip(uint256 usdcAmt) public {
        usdcAmt = bound(usdcAmt, 1e6, 50_000_000e6);
        uint256 shares = _giveCollateral(borrower, usdcAmt);
        _approveVenue();
        _postCollateral(borrower, shares);
        assertEq(market.collateralOf(borrower), shares);
        vm.prank(borrower);
        market.withdrawCollateral(shares, borrower);
        assertEq(market.collateralOf(borrower), 0);
        assertEq(vault.balanceOf(borrower), shares);
    }

    // --- Borrow / Repay / Accrual (slice 3) ---

    function test_borrow_happyPath() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        uint256 maxDebt = _collateralValue(borrower) * 7000 / 10_000;
        uint256 amount = maxDebt / 2;

        uint256 balBefore = usdc.balanceOf(borrower);
        vm.prank(borrower);
        uint256 shares = market.borrow(amount, borrower);

        assertGt(shares, 0);
        assertEq(usdc.balanceOf(borrower), balBefore + amount);
        assertEq(market.totalBorrowAssets(), amount);
        assertApproxEqAbs(market.borrowAssetsOf(borrower), amount, 1);
    }

    function test_borrow_exceedsLltv_reverts() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        uint256 collValue = _collateralValue(borrower);
        uint256 tooMuch = collValue * 7200 / 10_000; // 72% > 70% LLTV

        vm.prank(borrower);
        vm.expectRevert(LendingMarket.LendingMarket__HealthFactorTooLow.selector);
        market.borrow(tooMuch, borrower);
    }

    function test_borrow_insufficientLiquidity_reverts() public {
        // Plenty of collateral, but only 10k USDC supplied.
        _enableBorrow(10_000e6, 100_000e6, 100_000e6);
        // 50k is within LLTV (70k) but exceeds the 10k available liquidity.
        vm.prank(borrower);
        vm.expectRevert(LendingMarket.LendingMarket__InsufficientLiquidity.selector);
        market.borrow(50_000e6, borrower);
    }

    function test_borrow_notWhitelisted_reverts() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(LendingMarket.LendingMarket__NotWhitelisted.selector, stranger));
        market.borrow(1_000e6, stranger);
    }

    function test_borrow_staleNav_reverts() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        vm.warp(block.timestamp + navOracle.maxStaleness() + 1);
        vm.prank(borrower);
        vm.expectPartialRevert(NavOracle.NavOracle__StaleNav.selector);
        market.borrow(10_000e6, borrower);
    }

    function test_repay_partial() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        vm.prank(borrower);
        market.borrow(50_000e6, borrower);

        deal(address(usdc), borrower, 20_000e6);
        vm.startPrank(borrower);
        usdc.approve(address(market), 20_000e6);
        market.repay(20_000e6);
        vm.stopPrank();

        assertApproxEqAbs(market.borrowAssetsOf(borrower), 30_000e6, 1);
        assertApproxEqAbs(market.totalBorrowAssets(), 30_000e6, 1);
    }

    function test_repay_full_clearsDebt() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        vm.prank(borrower);
        market.borrow(50_000e6, borrower);

        // Fund a little extra in case interest accrued, repay generously.
        deal(address(usdc), borrower, 60_000e6);
        vm.startPrank(borrower);
        usdc.approve(address(market), 60_000e6);
        market.repay(type(uint256).max);
        vm.stopPrank();

        assertEq(market.borrowShares(borrower), 0);
        assertEq(market.borrowAssetsOf(borrower), 0);
        assertEq(market.totalBorrowShares(), 0);
    }

    function test_accrue_interestGrowsDebtAndSupply() public {
        _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        vm.prank(borrower);
        market.borrow(50_000e6, borrower);

        uint256 borrowBefore = market.totalBorrowAssets();
        uint256 supplyBefore = market.totalSupplyAssets();

        vm.warp(block.timestamp + 30 days);
        market.accrue();

        uint256 borrowDelta = market.totalBorrowAssets() - borrowBefore;
        uint256 supplyDelta = market.totalSupplyAssets() - supplyBefore;
        assertGt(borrowDelta, 0);
        // Interest added to both books equally (USDC conservation of the accrual).
        assertEq(borrowDelta, supplyDelta);
        // Protocol fee captured as supply shares to the fee recipient.
        assertGt(market.supplyShares(feeRecipient), 0);
    }

    function test_withdrawCollateral_breaksHealth_reverts() public {
        uint256 collShares = _enableBorrow(100_000e6, 100_000e6, 100_000e6);
        vm.prank(borrower);
        market.borrow(35_000e6, borrower); // 50% of 70k max

        // Removing 90% of collateral leaves ~10k value, max debt ~7k < 35k debt.
        vm.prank(borrower);
        vm.expectRevert(LendingMarket.LendingMarket__HealthFactorTooLow.selector);
        market.withdrawCollateral(collShares * 9 / 10, borrower);
    }

    function testFuzz_borrowWithinLltv_isHealthy(uint256 amount) public {
        _enableBorrow(1_000_000e6, 100_000e6, 100_000e6);
        uint256 maxDebt = _collateralValue(borrower) * 7000 / 10_000;
        amount = bound(amount, 1e6, maxDebt - 1e6);
        vm.prank(borrower);
        market.borrow(amount, borrower);
        assertTrue(market.isHealthy(borrower));
        assertApproxEqAbs(market.borrowAssetsOf(borrower), amount, 1);
    }
}
