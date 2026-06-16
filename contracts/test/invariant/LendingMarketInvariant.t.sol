// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../../script/DeployStack.s.sol";
import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {NavOracle} from "../../src/NavOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {NavShareOracle} from "../../src/lending/NavShareOracle.sol";
import {LendingMarket} from "../../src/lending/LendingMarket.sol";

/// @title LendingMarketHandler
/// @notice Bounded multi-actor handler for the permissioned LendingMarket:
///         lenders supply/withdraw USDC, borrowers post/withdraw nbUSDC collateral
///         and borrow/repay, a liquidator clears unhealthy positions, NAV drifts
///         within the oracle deviation guard, and time advances. Invalid actions
///         simply revert and roll back (fail-on-revert = false).
contract LendingMarketHandler is Test {
    LendingMarket public market;
    NavOracle public navOracle;
    InsuranceVault public vault;
    MockUSDC public usdc;
    address public deployer;
    address[] public lenders;
    address[] public borrowers;
    address public liquidator;

    uint256 public currentNav;

    struct Config {
        LendingMarket market;
        NavOracle navOracle;
        InsuranceVault vault;
        MockUSDC usdc;
        address deployer;
        address[] lenders;
        address[] borrowers;
        address liquidator;
        uint256 initialNav;
    }

    constructor(Config memory c) {
        market = c.market;
        navOracle = c.navOracle;
        vault = c.vault;
        usdc = c.usdc;
        deployer = c.deployer;
        lenders = c.lenders;
        borrowers = c.borrowers;
        liquidator = c.liquidator;
        currentNav = c.initialNav;
    }

    function supply(uint256 seed, uint256 amt) external {
        address lp = lenders[seed % lenders.length];
        amt = bound(amt, 1e6, 1_000_000e6);
        deal(address(usdc), lp, amt);
        vm.prank(lp);
        usdc.approve(address(market), amt);
        vm.prank(lp);
        market.supply(amt);
    }

    function withdraw(uint256 seed, uint256 amt) external {
        address lp = lenders[seed % lenders.length];
        amt = bound(amt, 1, 1_000_000e6);
        vm.prank(lp);
        market.withdraw(amt, lp);
    }

    function depositCollateral(uint256 seed, uint256 amt) external {
        address b = borrowers[seed % borrowers.length];
        uint256 bal = vault.balanceOf(b);
        if (bal == 0) return;
        amt = bound(amt, 1, bal);
        vm.prank(b);
        vault.approve(address(market), amt);
        vm.prank(b);
        market.depositCollateral(amt);
    }

    function withdrawCollateral(uint256 seed, uint256 amt) external {
        address b = borrowers[seed % borrowers.length];
        uint256 c = market.collateralOf(b);
        if (c == 0) return;
        amt = bound(amt, 1, c);
        vm.prank(b);
        market.withdrawCollateral(amt, b);
    }

    function borrow(uint256 seed, uint256 amt) external {
        address b = borrowers[seed % borrowers.length];
        amt = bound(amt, 1e6, 200_000e6);
        vm.prank(b);
        market.borrow(amt, b);
    }

    function repay(uint256 seed, uint256 amt) external {
        address b = borrowers[seed % borrowers.length];
        amt = bound(amt, 1e6, 300_000e6);
        deal(address(usdc), b, amt);
        vm.prank(b);
        usdc.approve(address(market), amt);
        vm.prank(b);
        market.repay(amt);
    }

    function liquidate(uint256 seed, uint256 amt) external {
        address b = borrowers[seed % borrowers.length];
        amt = bound(amt, 1e6, 300_000e6);
        deal(address(usdc), liquidator, amt);
        vm.prank(liquidator);
        usdc.approve(address(market), amt);
        vm.prank(liquidator);
        market.liquidate(b, amt);
    }

    function adjustNav(uint256 seed) external {
        // Drift within +/-15% of the last value (under the 20% deviation guard).
        uint256 lo = currentNav * 85 / 100;
        uint256 hi = currentNav * 115 / 100;
        uint256 nav = bound(seed, lo, hi);
        if (nav < 10_000e6) nav = 10_000e6;
        vm.prank(deployer);
        navOracle.publishNav(address(vault), nav, 9000, keccak256(abi.encode(seed)));
        currentNav = nav;
    }

    function warp(uint256 secs) external {
        secs = bound(secs, 1 hours, 15 days);
        vm.warp(block.timestamp + secs);
    }

    function accrue() external {
        market.accrue();
    }
}

/// @title LendingMarketInvariantTest
/// @notice Stateful invariants for the isolated lending market: USDC conservation,
///         collateral conservation, and borrow never exceeding supplied liquidity.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 64
/// forge-config: default.invariant.fail-on-revert = false
contract LendingMarketInvariantTest is Test {
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
    LendingMarketHandler handler;

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
        market = new LendingMarket(_params());

        // Approve the market as a custody venue.
        vm.prank(deployer);
        compliance.setApprovedVenue(address(market), true);

        // Actors.
        address[] memory lenders = new address[](2);
        lenders[0] = makeAddr("lenderA");
        lenders[1] = makeAddr("lenderB");
        address[] memory borrowers = new address[](2);
        borrowers[0] = makeAddr("borrowerA");
        borrowers[1] = makeAddr("borrowerB");
        address liquidator = makeAddr("liquidatorInv");

        vm.startPrank(deployer);
        for (uint256 i = 0; i < lenders.length; i++) {
            compliance.setWhitelist(lenders[i], true);
            compliance.setKycExpiry(lenders[i], uint64(block.timestamp + 3650 days));
        }
        for (uint256 i = 0; i < borrowers.length; i++) {
            compliance.setWhitelist(borrowers[i], true);
            compliance.setKycExpiry(borrowers[i], uint64(block.timestamp + 3650 days));
        }
        compliance.setWhitelist(liquidator, true);
        compliance.setKycExpiry(liquidator, uint64(block.timestamp + 3650 days));
        vm.stopPrank();

        // Seed each borrower with nbUSDC collateral (deposit into the vault).
        uint256 seedDeposit = 100_000e6;
        for (uint256 i = 0; i < borrowers.length; i++) {
            deal(address(usdc), borrowers[i], seedDeposit);
            vm.startPrank(borrowers[i]);
            usdc.approve(address(vault), seedDeposit);
            vault.deposit(seedDeposit, borrowers[i]);
            vm.stopPrank();
        }

        // Publish an initial NAV matching the seeded vault assets.
        uint256 initialNav = borrowers.length * seedDeposit;
        vm.prank(deployer);
        navOracle.publishNav(address(vault), initialNav, 9000, keccak256("init-nav"));

        handler = new LendingMarketHandler(
            LendingMarketHandler.Config({
                market: market,
                navOracle: navOracle,
                vault: vault,
                usdc: usdc,
                deployer: deployer,
                lenders: lenders,
                borrowers: borrowers,
                liquidator: liquidator,
                initialNav: initialNav
            })
        );

        targetContract(address(handler));
    }

    function _params() internal returns (LendingMarket.MarketParams memory) {
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
            supplyCap: 0,
            borrowCap: 0,
            feeRecipient: makeAddr("feeSink"),
            baseRatePerSecondWad: 0,
            slopePerSecondWad: 1e10
        });
    }

    /// @notice Free USDC held by the market equals supplied minus borrowed assets.
    function invariant_usdcConservation() public view {
        assertEq(
            usdc.balanceOf(address(market)),
            market.totalSupplyAssets() - market.totalBorrowAssets(),
            "USDC conservation violated"
        );
    }

    /// @notice The market custodies exactly the collateral it accounts for.
    function invariant_collateralConservation() public view {
        assertEq(vault.balanceOf(address(market)), market.totalCollateral(), "collateral conservation violated");
    }

    /// @notice Borrowed assets never exceed supplied assets.
    function invariant_borrowNeverExceedsSupply() public view {
        assertLe(market.totalBorrowAssets(), market.totalSupplyAssets(), "borrow exceeds supply");
    }
}
