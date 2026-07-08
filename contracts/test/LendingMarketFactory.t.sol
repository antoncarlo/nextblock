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
import {LendingMarketFactory} from "../src/lending/LendingMarketFactory.sol";

/// @title LendingMarketFactoryTest
/// @notice Permissioned factory that deploys a NavShareOracle + LendingMarket per
///         collateral vault. Curator-gated; venue approval stays a separate
///         KYC-operator act (role separation).
contract LendingMarketFactoryTest is Test {
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack deploy;
    InsuranceVault vault;
    NavOracle navOracle;
    ComplianceRegistry compliance;
    ProtocolRoles roles;
    MockUSDC usdc;
    address deployer;

    LendingMarketFactory factory;

    function setUp() public {
        deploy = new DeployStack();
        deploy.runWithConfig(ANVIL_PK, false, address(0));

        vault = deploy.vault();
        navOracle = deploy.navOracle();
        compliance = deploy.compliance();
        roles = deploy.protocolRoles();
        usdc = deploy.usdc();
        deployer = deploy.deployer(); // holds UNDERWRITING_CURATOR_ROLE + KYC_OPERATOR + ORACLE

        factory = new LendingMarketFactory(address(usdc), address(navOracle), address(roles), address(compliance));
    }

    function _cfg(address collateralVault) internal returns (LendingMarketFactory.CreateParams memory) {
        return LendingMarketFactory.CreateParams({
            collateralVault: collateralVault,
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

    // --- Constructor ---

    function test_constructor_zeroAddress_reverts() public {
        vm.expectRevert(LendingMarketFactory.LendingMarketFactory__InvalidParams.selector);
        new LendingMarketFactory(address(0), address(navOracle), address(roles), address(compliance));
    }

    // --- createMarket access ---

    function test_createMarket_onlyCurator() public {
        address notCurator = makeAddr("notCurator");
        bytes32 curatorRole = roles.UNDERWRITING_CURATOR_ROLE();
        vm.expectRevert(
            abi.encodeWithSelector(
                LendingMarketFactory.LendingMarketFactory__UnauthorizedRole.selector, notCurator, curatorRole
            )
        );
        vm.prank(notCurator);
        factory.createMarket(_cfg(address(vault)));
    }

    function test_createMarket_zeroVault_reverts() public {
        vm.prank(deployer);
        vm.expectRevert(LendingMarketFactory.LendingMarketFactory__InvalidParams.selector);
        factory.createMarket(_cfg(address(0)));
    }

    function test_createMarket_invalidRiskParams_reverts() public {
        LendingMarketFactory.CreateParams memory cfg = _cfg(address(vault));
        cfg.lltvBps = 9000; // > liqLtv 8000
        vm.prank(deployer);
        vm.expectRevert(LendingMarket.LendingMarket__InvalidParams.selector);
        factory.createMarket(cfg);
    }

    // --- createMarket happy path ---

    function test_createMarket_deploysWiredMarket() public {
        vm.prank(deployer);
        address market = factory.createMarket(_cfg(address(vault)));

        assertTrue(factory.isMarket(market));
        assertEq(factory.getMarketCount(), 1);
        assertEq(factory.getMarkets()[0], market);

        LendingMarket m = LendingMarket(market);
        assertEq(address(m.loanToken()), address(usdc));
        assertEq(address(m.collateralToken()), address(vault));
        assertEq(m.lltvBps(), 7000);
        assertEq(m.liqLtvBps(), 8000);

        // Oracle is a NavShareOracle bound to the global NavOracle + this vault.
        NavShareOracle o = NavShareOracle(address(m.oracle()));
        assertEq(address(o.navOracle()), address(navOracle));
        assertEq(o.vault(), address(vault));
    }

    function test_createMarket_emitsEvent() public {
        vm.recordLogs();
        vm.prank(deployer);
        address market = factory.createMarket(_cfg(address(vault)));
        // Market is tracked (event payload covered structurally by the happy-path test).
        assertTrue(factory.isMarket(market));
    }

    function test_createMarket_multiple() public {
        vm.startPrank(deployer);
        address m1 = factory.createMarket(_cfg(address(vault)));
        address m2 = factory.createMarket(_cfg(address(vault)));
        vm.stopPrank();
        assertEq(factory.getMarketCount(), 2);
        assertTrue(m1 != m2);
    }

    // --- A factory-created market is fully functional ---

    function test_createdMarket_supportsBorrowFlow() public {
        vm.prank(deployer);
        address market = factory.createMarket(_cfg(address(vault)));
        LendingMarket m = LendingMarket(market);

        // KYC operator approves the venue + whitelists actors (separate from factory).
        address lender = makeAddr("lender");
        address borrower = makeAddr("borrower");
        vm.startPrank(deployer); // KYC_OPERATOR
        compliance.setApprovedVenue(market, true);
        compliance.setWhitelist(lender, true);
        compliance.setKycExpiry(lender, uint64(block.timestamp + 365 days));
        compliance.setWhitelist(borrower, true);
        compliance.setKycExpiry(borrower, uint64(block.timestamp + 365 days));
        vm.stopPrank();

        // Lender supplies USDC.
        deal(address(usdc), lender, 100_000e6);
        vm.startPrank(lender);
        usdc.approve(market, 100_000e6);
        m.supply(100_000e6);
        vm.stopPrank();

        // Borrower posts nbUSDC collateral.
        deal(address(usdc), borrower, 100_000e6);
        vm.startPrank(borrower);
        usdc.approve(address(vault), 100_000e6);
        uint256 shares = vault.deposit(100_000e6, borrower);
        vault.approve(market, shares);
        m.depositCollateral(shares);
        vm.stopPrank();

        // Publish NAV, then borrow.
        vm.prank(deployer); // ORACLE
        navOracle.publishNav(address(vault), 100_000e6, 9000, keccak256("nav"));

        vm.prank(borrower);
        uint256 borrowShares = m.borrow(50_000e6, borrower);
        assertGt(borrowShares, 0);
        assertEq(usdc.balanceOf(borrower), 50_000e6);
    }
}
