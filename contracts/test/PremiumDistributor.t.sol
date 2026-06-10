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
import {PremiumDistributor} from "../src/PremiumDistributor.sol";

/// @title PremiumDistributorTest
/// @notice Phase 4 suite: documented premium split (LP quota / protocol fee /
///         underwriting fee), exact USDC conservation, role gates, routing rules,
///         fee claims, vault-side UPR accounting and rounding fuzz.
contract PremiumDistributorTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;
    PremiumDistributor public distributor;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public cedant = makeAddr("cedant");
    address public lp = makeAddr("institutionalLP");
    address public attacker = makeAddr("attacker");
    address public feeTreasury = makeAddr("feeTreasury");
    address public syndicateAccount = makeAddr("syndicateAccount");

    uint256 public pid;
    uint64 public inception;
    uint64 public expiry;

    uint256 constant GROSS_100K = 100_000e6;
    uint256 constant COVERAGE_1M = 1_000_000e6;

    function setUp() public {
        vm.startPrank(admin);

        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        distributor = new PremiumDistributor(
            address(usdc), address(protocolRoles), address(portfolioRegistry)
        );

        // Roles
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        // The distributor forwards LP quotas into the vault: it holds the depositor role.
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), address(distributor));

        // LP onboarding
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

        // Vault
        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC-BAL",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 0, // isolate premium accounting from fee accrual
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);
        vm.stopPrank();

        // Approved portfolio
        inception = uint64(block.timestamp);
        expiry = uint64(block.timestamp + 365 days);
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(PortfolioRegistry.SubmissionParams({
            name: "EU Property CAT QS 2026",
            metadataURI: "ipfs://QmDocs",
            documentHash: keccak256("docs"),
            lineOfBusiness: "Property CAT",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: COVERAGE_1M,
            cededPremium: GROSS_100K,
            inceptionTime: inception,
            expiryTime: expiry
        }));
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500); // expectedLossBps mock
        vm.stopPrank();

        // Route portfolio -> vault
        vm.prank(managerA);
        distributor.setPortfolioVault(pid, address(vault));

        // Fund cedant
        vm.startPrank(admin);
        usdc.mint(cedant, 10_000_000e6);
        vm.stopPrank();
    }

    function _receive(uint256 amount) internal {
        vm.startPrank(cedant);
        usdc.approve(address(distributor), amount);
        distributor.receivePremium(pid, amount);
        vm.stopPrank();
    }

    // =========== CONFIGURATION ===========

    function test_defaults() public view {
        assertEq(distributor.protocolFeeBps(), distributor.DEFAULT_PROTOCOL_FEE_BPS());      // 1.5%
        assertEq(distributor.underwritingFeeBps(), distributor.DEFAULT_UNDERWRITING_FEE_BPS()); // 10%
    }

    function test_setPremiumSplit_onlyOwnerRole() public {
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__UnauthorizedRole.selector, attacker, ownerRole
        ));
        distributor.setPremiumSplit(100, 500);
    }

    function test_setPremiumSplit_bounds() public {
        uint256 maxP = distributor.MAX_PROTOCOL_FEE_BPS();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__FeeAboveMax.selector, maxP + 1, maxP
        ));
        distributor.setPremiumSplit(maxP + 1, 500);

        uint256 maxU = distributor.MAX_UNDERWRITING_FEE_BPS();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__FeeAboveMax.selector, maxU + 1, maxU
        ));
        distributor.setPremiumSplit(100, maxU + 1);

        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit PremiumDistributor.PremiumSplitUpdated(200, 1_500);
        distributor.setPremiumSplit(200, 1_500);
    }

    function test_setPortfolioVault_onlyCurator() public {
        bytes32 curatorRole = protocolRoles.UNDERWRITING_CURATOR_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__UnauthorizedRole.selector, attacker, curatorRole
        ));
        distributor.setPortfolioVault(pid, address(vault));
    }

    function test_setPortfolioVault_immutableAfterFunding() public {
        _receive(10_000e6);

        vm.prank(managerA);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__VaultChangeAfterFunding.selector, pid
        ));
        distributor.setPortfolioVault(pid, makeAddr("otherVault"));
    }

    function test_constructor_zeroParams_revert() public {
        vm.expectRevert(PremiumDistributor.PremiumDistributor__InvalidParams.selector);
        new PremiumDistributor(address(0), address(protocolRoles), address(portfolioRegistry));
        vm.expectRevert(PremiumDistributor.PremiumDistributor__InvalidParams.selector);
        new PremiumDistributor(address(usdc), address(0), address(portfolioRegistry));
        vm.expectRevert(PremiumDistributor.PremiumDistributor__InvalidParams.selector);
        new PremiumDistributor(address(usdc), address(protocolRoles), address(0));
    }

    // =========== PREMIUM SPLIT & CONSERVATION ===========

    function test_receivePremium_split_exact() public {
        // 100K gross: protocol 1.5% = 1,500; underwriting 10% = 10,000; LP = 88,500
        _receive(GROSS_100K);

        assertEq(distributor.accruedProtocolFees(), 1_500e6);
        assertEq(distributor.accruedUnderwritingFees(), 10_000e6);
        assertEq(usdc.balanceOf(address(vault)), 88_500e6);

        // Conservation: distributor holds exactly the accrued fees
        assertEq(
            usdc.balanceOf(address(distributor)),
            distributor.accruedProtocolFees() + distributor.accruedUnderwritingFees()
        );

        PremiumDistributor.PremiumAccounting memory acc = distributor.getPremiumAccounting(pid);
        assertEq(acc.gross, GROSS_100K);
        assertEq(acc.lpQuota + acc.protocolFees + acc.underwritingFees, acc.gross); // exact split
        assertEq(vault.portfolioPremium(pid), acc.lpQuota);
    }

    function test_receivePremium_events() public {
        (uint256 lpQuota, uint256 pFee, uint256 uFee) = distributor.previewSplit(GROSS_100K);

        vm.startPrank(cedant);
        usdc.approve(address(distributor), GROSS_100K);

        vm.expectEmit(true, true, false, true);
        emit PremiumDistributor.PremiumReceived(pid, cedant, GROSS_100K);
        vm.expectEmit(true, false, false, true);
        emit PremiumDistributor.ProtocolFeeAccrued(pid, pFee);
        vm.expectEmit(true, false, false, true);
        emit PremiumDistributor.UnderwritingFeeAccrued(pid, uFee);
        vm.expectEmit(true, true, false, true);
        emit PremiumDistributor.PremiumAllocated(pid, address(vault), lpQuota);

        distributor.receivePremium(pid, GROSS_100K);
        vm.stopPrank();
    }

    function test_receivePremium_unauthorized_reverts() public {
        vm.startPrank(admin);
        usdc.mint(attacker, 1_000e6);
        vm.stopPrank();

        vm.startPrank(attacker);
        usdc.approve(address(distributor), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__UnauthorizedPremiumSource.selector, attacker
        ));
        distributor.receivePremium(pid, 1_000e6);
        vm.stopPrank();
    }

    function test_receivePremium_vaultNotSet_reverts() public {
        // New approved portfolio without routing
        vm.prank(cedant);
        uint256 pid2 = portfolioRegistry.submitPortfolio(PortfolioRegistry.SubmissionParams({
            name: "Unrouted Treaty",
            metadataURI: "ipfs://x",
            documentHash: keccak256("x"),
            lineOfBusiness: "Marine",
            jurisdiction: "UK",
            structureType: PortfolioRegistry.StructureType.XOL,
            coverageLimit: COVERAGE_1M,
            cededPremium: GROSS_100K,
            inceptionTime: inception,
            expiryTime: expiry
        }));
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid2);
        portfolioRegistry.approvePortfolio(pid2, 5_000);
        vm.stopPrank();

        vm.startPrank(cedant);
        usdc.approve(address(distributor), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__VaultNotSet.selector, pid2
        ));
        distributor.receivePremium(pid2, 1_000e6);
        vm.stopPrank();
    }

    function test_receivePremium_notAllocatable_reverts() public {
        // Pause the portfolio (sentinel) -> not allocatable
        vm.startPrank(admin);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), admin);
        portfolioRegistry.activatePortfolio(pid);
        portfolioRegistry.pausePortfolio(pid);
        vm.stopPrank();

        vm.startPrank(cedant);
        usdc.approve(address(distributor), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__PortfolioNotAllocatable.selector, pid
        ));
        distributor.receivePremium(pid, 1_000e6);
        vm.stopPrank();
    }

    function test_receivePremium_zeroAmount_reverts() public {
        vm.prank(cedant);
        vm.expectRevert(PremiumDistributor.PremiumDistributor__InvalidParams.selector);
        distributor.receivePremium(pid, 0);
    }

    // =========== FEE CLAIMS ===========

    function test_claimFees_flow() public {
        _receive(GROSS_100K);

        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit PremiumDistributor.ProtocolFeesClaimed(feeTreasury, 1_500e6);
        distributor.claimProtocolFees(feeTreasury);
        assertEq(usdc.balanceOf(feeTreasury), 1_500e6);
        assertEq(distributor.accruedProtocolFees(), 0);

        vm.prank(admin);
        distributor.claimUnderwritingFees(syndicateAccount);
        assertEq(usdc.balanceOf(syndicateAccount), 10_000e6);

        // Distributor fully drained: conservation holds
        assertEq(usdc.balanceOf(address(distributor)), 0);
    }

    function test_claimFees_onlyOwnerRole() public {
        _receive(GROSS_100K);
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            PremiumDistributor.PremiumDistributor__UnauthorizedRole.selector, attacker, ownerRole
        ));
        distributor.claimProtocolFees(attacker);
    }

    function test_claimFees_nothingToClaim_reverts() public {
        vm.prank(admin);
        vm.expectRevert(PremiumDistributor.PremiumDistributor__NothingToClaim.selector);
        distributor.claimProtocolFees(feeTreasury);
    }

    // =========== VAULT-SIDE UPR ===========

    function test_vaultUPR_premiumNotImmediatelyEarned() public {
        // LP deposits first so the vault has share supply
        vm.startPrank(admin);
        usdc.mint(lp, 50_000e6);
        vm.stopPrank();
        vm.startPrank(lp);
        usdc.approve(address(vault), 50_000e6);
        vault.deposit(50_000e6, lp);
        vm.stopPrank();

        uint256 taBefore = vault.totalAssets();
        _receive(GROSS_100K); // LP quota 88.5K enters at inception -> fully unearned

        // NAV must NOT jump on receipt (UPR correctness)
        assertEq(vault.totalAssets(), taBefore);

        (, uint256 upr,,,,,,) = vault.getVaultAccounting();
        assertEq(upr, 88_500e6);

        // Withdrawals cannot consume premium cash
        uint256 maxW = vault.maxWithdraw(lp);
        assertLe(maxW, 50_000e6);

        // Half the coverage window elapses -> ~half earned
        vm.warp(uint256(inception) + 182 days + 12 hours); // 182.5 days = half of 365
        (, uint256 uprHalf,,,,,,) = vault.getVaultAccounting();
        assertApproxEqAbs(uprHalf, 44_250e6, 1e6);
        assertApproxEqAbs(vault.totalAssets(), taBefore + 44_250e6, 1e6);

        // After expiry -> fully earned
        vm.warp(uint256(expiry) + 1);
        (, uint256 uprEnd,,,,,,) = vault.getVaultAccounting();
        assertEq(uprEnd, 0);
        assertEq(vault.totalAssets(), taBefore + 88_500e6);
    }

    function test_vault_recordPortfolioPremium_directCallerNeedsRole() public {
        vm.startPrank(admin);
        usdc.mint(attacker, 1_000e6);
        vm.stopPrank();

        vm.startPrank(attacker);
        usdc.approve(address(vault), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker
        ));
        vault.recordPortfolioPremium(pid, 1_000e6);
        vm.stopPrank();
    }

    // =========== FUZZ ===========

    function testFuzz_split_conservation(uint256 gross, uint256 pBps, uint256 uBps) public {
        gross = bound(gross, 1, 5_000_000e6);
        pBps = bound(pBps, 0, distributor.MAX_PROTOCOL_FEE_BPS());
        uBps = bound(uBps, 0, distributor.MAX_UNDERWRITING_FEE_BPS());

        vm.prank(admin);
        distributor.setPremiumSplit(pBps, uBps);

        uint256 vaultBefore = usdc.balanceOf(address(vault));
        uint256 cedantBefore = usdc.balanceOf(cedant);

        _receive(gross);

        // Exact conservation: gross == lpQuota (vault delta) + accrued fees
        uint256 lpQuota = usdc.balanceOf(address(vault)) - vaultBefore;
        assertEq(cedantBefore - usdc.balanceOf(cedant), gross);
        assertEq(
            lpQuota + distributor.accruedProtocolFees() + distributor.accruedUnderwritingFees(),
            gross,
            "conservation violated"
        );
        // Distributor holds exactly the fees
        assertEq(
            usdc.balanceOf(address(distributor)),
            distributor.accruedProtocolFees() + distributor.accruedUnderwritingFees()
        );
        // Fees round up -> LP quota never exceeds the floor share
        assertLe(lpQuota, gross * (10_000 - pBps - uBps) / 10_000 + 2);
    }

    function testFuzz_uprNeverExceedsLpQuota(uint256 gross, uint64 warpTo) public {
        gross = bound(gross, 1e6, 1_000_000e6);
        _receive(gross);

        PremiumDistributor.PremiumAccounting memory acc = distributor.getPremiumAccounting(pid);

        warpTo = uint64(bound(warpTo, block.timestamp, uint256(expiry) + 30 days));
        vm.warp(warpTo);

        (, uint256 upr,,,,,,) = vault.getVaultAccounting();
        assertLe(upr, acc.lpQuota, "UPR exceeds LP quota");
        if (warpTo >= expiry) assertEq(upr, 0);
    }
}
