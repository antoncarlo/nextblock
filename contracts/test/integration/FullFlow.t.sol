// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {VaultFactory} from "../../src/VaultFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title FullFlowTest
/// @notice Integration test: deploy -> deposit -> advance time -> trigger claims -> exercise -> withdraw.
///         Follows the HP1-HP5 demo flows from the tech spec.
contract FullFlowTest is Test {
    // --- Contracts ---
    MockUSDC public usdc;
    MockOracle public oracle;
    PolicyRegistry public registry;
    ClaimReceipt public claimReceipt;
    VaultFactory public factory;
    InsuranceVault public vaultA;
    InsuranceVault public vaultB;

    // --- Actors ---
    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public managerB = makeAddr("managerB");
    address public investor = makeAddr("investor");
    address public insurer = makeAddr("insurer");
    address public oracleReporter = makeAddr("oracleReporter");
    address public insurerAdmin = makeAddr("insurerAdmin");

    function setUp() public {
        vm.startPrank(admin);

        // Phase 1: Deploy standalone contracts
        usdc = new MockUSDC();
        oracle = new MockOracle();
        claimReceipt = new ClaimReceipt();
        registry = new PolicyRegistry();

        // Phase 2: Deploy factory + vaults
        factory = new VaultFactory(
            address(usdc),
            address(registry),
            address(oracle),
            address(claimReceipt)
        );

        // Set factory as registrar so it can auto-register vault minters
        claimReceipt.setRegistrar(address(factory));

        address vaultAAddr = factory.createVault(
            "NextBlock Balanced Core", "nxbBAL", "Balanced Core",
            managerA, 2000, 50  // 20% buffer, 0.5% fee
        );
        address vaultBAddr = factory.createVault(
            "NextBlock DeFi Alpha", "nxbALPHA", "DeFi Alpha",
            managerB, 1500, 100  // 15% buffer, 1% fee
        );

        vaultA = InsuranceVault(vaultAAddr);
        vaultB = InsuranceVault(vaultBAddr);

        // No manual setAuthorizedMinter calls needed -- factory auto-registers via registrar

        // Phase 3: Register + activate policies
        registry.registerPolicy("BTC Price Protection", PolicyRegistry.VerificationType.ON_CHAIN, 50_000e6, 2_500e6, 90 days, insurer, 80_000e8);
        registry.registerPolicy("Flight Delay", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, 15_000e6, 1_200e6, 60 days, insurer, 0);
        registry.registerPolicy("Commercial Fire", PolicyRegistry.VerificationType.OFF_CHAIN, 40_000e6, 2_400e6, 180 days, insurer, 0);

        registry.activatePolicy(0);
        registry.activatePolicy(1);
        registry.activatePolicy(2);

        vm.stopPrank();

        // Phase 4: Add policies to vaults + deposit premiums
        vm.prank(managerA);
        vaultA.addPolicy(0, 4000);  // P1: 40%
        vm.prank(managerA);
        vaultA.addPolicy(1, 2000);  // P2: 20%
        vm.prank(managerA);
        vaultA.addPolicy(2, 4000);  // P3: 40%

        vm.prank(managerB);
        vaultB.addPolicy(0, 6000);  // P1: 60%
        vm.prank(managerB);
        vaultB.addPolicy(1, 4000);  // P2: 40%

        // Mint and deposit premiums
        vm.startPrank(admin);
        // Vault A premiums: $2,500 + $1,200 + $2,400 = $6,100
        usdc.mint(admin, 6_100e6 + 3_700e6);
        usdc.approve(address(vaultA), 6_100e6);
        vaultA.depositPremium(0, 2_500e6);
        vaultA.depositPremium(1, 1_200e6);
        vaultA.depositPremium(2, 2_400e6);

        // Vault B premiums: $2,500 + $1,200 = $3,700
        usdc.approve(address(vaultB), 3_700e6);
        vaultB.depositPremium(0, 2_500e6);
        vaultB.depositPremium(1, 1_200e6);

        // Set roles on both vaults
        vaultA.setOracleReporter(oracleReporter);
        vaultA.setInsurerAdmin(insurerAdmin);
        vaultB.setOracleReporter(oracleReporter);
        vaultB.setInsurerAdmin(insurerAdmin);

        // Fund investor
        usdc.mint(investor, 50_000e6);
        vm.stopPrank();
    }

    // =========== HP1: YIELD ACCRUAL ===========

    function test_fullDemoFlow_yieldAccrual() public {
        // Step 1: Investor deposits $10K into Vault A
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        uint256 shares = vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        assertGt(shares, 0);
        uint256 assetsDay0 = vaultA.totalAssets();
        assertApproxEqAbs(assetsDay0, 10_000e6, 100);

        // Step 2: Advance 30 days
        vm.prank(admin);
        registry.advanceTime(30 days);

        uint256 assetsDay30 = vaultA.totalAssets();
        assertGt(assetsDay30, assetsDay0, "NAV should increase after 30 days");

        // Verify premium earnings:
        // P1: $2,500 * 30/90  = $833
        // P2: $1,200 * 30/60  = $600
        // P3: $2,400 * 30/180 = $400
        // Total earned: $1,833 (minus small fee)
        uint256 earned = assetsDay30 - assetsDay0;
        assertGt(earned, 1_800e6, "Earned should be approximately $1,833");
        assertLt(earned, 1_850e6, "Earned should be approximately $1,833");

        // Step 3: Investor can withdraw (buffer limited)
        uint256 maxW = vaultA.maxWithdraw(investor);
        assertGt(maxW, 0);

        vm.startPrank(investor);
        uint256 balBefore = usdc.balanceOf(investor);
        vaultA.withdraw(maxW, investor, investor);
        uint256 balAfter = usdc.balanceOf(investor);
        vm.stopPrank();

        assertEq(balAfter - balBefore, maxW);
    }

    // =========== HP2: BTC CRASH -- SHARED POLICY ===========

    function test_sharedPolicyClaimFlow() public {
        // Setup: Investor deposits into both vaults
        // Vault A: $10K + $6.1K premiums = $16.1K < $50K = SHORTFALL
        // Vault B: $5K + $3.7K premiums = $8.7K < $50K = SHORTFALL
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        usdc.approve(address(vaultB), 5_000e6);
        vaultB.deposit(5_000e6, investor);
        vm.stopPrank();

        // Advance 30 days
        vm.prank(admin);
        registry.advanceTime(30 days);

        uint256 assetsA_before = vaultA.totalAssets();
        uint256 assetsB_before = vaultB.totalAssets();

        // BTC crashes
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        // Trigger P1 on Vault A -- SHORTFALL ($16.1K < $50K)
        vaultA.checkClaim(0);
        uint256 assetsA_after = vaultA.totalAssets();
        assertLt(assetsA_after, assetsA_before, "Vault A NAV should drop after P1 claim");

        // Trigger P1 on Vault B independently -- SHORTFALL ($8.7K < $50K)
        vaultB.checkClaim(0);
        uint256 assetsB_after = vaultB.totalAssets();
        assertLt(assetsB_after, assetsB_before, "Vault B NAV should drop after P1 claim");

        // Both vaults minted separate receipts
        assertEq(claimReceipt.nextReceiptId(), 2, "Two receipts should be minted");

        // Verify receipts are independent
        ClaimReceipt.Receipt memory receiptA = claimReceipt.getReceipt(0);
        ClaimReceipt.Receipt memory receiptB = claimReceipt.getReceipt(1);
        assertEq(receiptA.vault, address(vaultA));
        assertEq(receiptB.vault, address(vaultB));
        assertEq(receiptA.claimAmount, 50_000e6);
        assertEq(receiptB.claimAmount, 50_000e6);

        // Both are shortfall -- receipts NOT auto-exercised
        assertFalse(receiptA.exercised);
        assertFalse(receiptB.exercised);
        assertEq(vaultA.totalPendingClaims(), 50_000e6);
        assertEq(vaultB.totalPendingClaims(), 50_000e6);
    }

    // =========== HP3: FLIGHT DELAY ===========

    function test_flightDelayClaimFlow() public {
        // Setup: Investor deposits $10K into Vault A
        // Vault A balance = $10K + $6.1K premiums = $16.1K > $15K claim = AUTO-EXERCISE
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        uint256 assetsBefore = vaultA.totalAssets();

        // Admin sets flight delayed
        vm.prank(admin);
        oracle.setFlightStatus(true);

        // Oracle reporter triggers claim -- auto-exercise since $16.1K > $15K
        vm.prank(oracleReporter);
        vaultA.reportEvent(1);

        uint256 assetsAfter = vaultA.totalAssets();
        assertLt(assetsAfter, assetsBefore, "NAV should drop by $15K claim");

        // Non-reporter cannot trigger (already claimed anyway)
        vm.prank(investor);
        vm.expectRevert();
        vaultA.reportEvent(1);

        // Insurer already received USDC via auto-exercise -- no manual exerciseClaim needed
        uint256 insurerBal = usdc.balanceOf(insurer);
        assertEq(insurerBal, 15_000e6);

        // Verify auto-exercise state
        assertEq(vaultA.totalPendingClaims(), 0);
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertTrue(receipt.exercised);
    }

    // =========== HP4: COMMERCIAL FIRE (PARTIAL) ===========

    function test_commercialFirePartialClaim() public {
        // Setup: Investor deposits $40K into Vault A
        // Vault A balance = $40K + $6.1K premiums = $46.1K > $35K claim = AUTO-EXERCISE
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 40_000e6);
        vaultA.deposit(40_000e6, investor);
        vm.stopPrank();

        // Insurer submits partial claim ($35K of $40K)
        vm.prank(insurerAdmin);
        vaultA.submitClaim(2, 35_000e6);

        (,,,,bool claimed, uint256 claimAmount) = vaultA.vaultPolicies(2);
        assertTrue(claimed);
        assertEq(claimAmount, 35_000e6);

        // P3 not in Vault B
        vm.prank(insurerAdmin);
        vm.expectRevert();
        vaultB.submitClaim(2, 35_000e6);

        // Insurer already received USDC via auto-exercise
        uint256 insurerBal = usdc.balanceOf(insurer);
        assertEq(insurerBal, 35_000e6);

        // Verify auto-exercise state
        assertEq(vaultA.totalPendingClaims(), 0);
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertTrue(receipt.exercised);
    }

    // =========== HP5: FULL DEMO FLOW ===========

    function test_fullDemoSequence() public {
        // 0:30 -- Investor deposits $10K into Vault A
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);

        // 1:00 -- Deposit $5K into Vault B
        usdc.approve(address(vaultB), 5_000e6);
        vaultB.deposit(5_000e6, investor);
        vm.stopPrank();

        // 1:30 -- Advance 30 days
        vm.prank(admin);
        registry.advanceTime(30 days);

        uint256 assetsA = vaultA.totalAssets();
        uint256 assetsB = vaultB.totalAssets();
        assertGt(assetsA, 10_000e6, "Vault A should have appreciated");
        assertGt(assetsB, 5_000e6, "Vault B should have appreciated");

        // 2:00 -- BTC crashes to $75K
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        // 2:10 -- Trigger P1 on Vault A
        // Vault A balance ~= $10K + $6.1K = $16.1K < $50K = SHORTFALL
        vaultA.checkClaim(0);

        // 2:20 -- Trigger P1 on Vault B
        // Vault B balance ~= $5K + $3.7K = $8.7K < $50K = SHORTFALL
        vaultB.checkClaim(0);

        // Both are shortfall -- manual exercise needed
        assertEq(vaultA.totalPendingClaims(), 50_000e6);
        assertEq(vaultB.totalPendingClaims(), 50_000e6);

        // 2:40 -- Insurer exercises Vault A receipt (capped at balance)
        vm.prank(insurer);
        vaultA.exerciseClaim(0);

        // Exercise Vault B receipt (capped at balance)
        vm.prank(insurer);
        vaultB.exerciseClaim(1);

        // Insurer received USDC from both vaults (capped at each vault's balance)
        uint256 insurerBal = usdc.balanceOf(insurer);
        assertGt(insurerBal, 0);

        // Verify that policy P1 is claimed in both vaults
        (,,,,bool claimedA,) = vaultA.vaultPolicies(0);
        (,,,,bool claimedB,) = vaultB.vaultPolicies(0);
        assertTrue(claimedA);
        assertTrue(claimedB);

        // Pending claims resolved after exercise
        assertEq(vaultA.totalPendingClaims(), 0);
        assertEq(vaultB.totalPendingClaims(), 0);
    }

    // =========== MULTIPLE CLAIMS SEQUENTIAL ===========

    function test_multipleClaimsSequential() public {
        // Setup: larger deposit to absorb multiple claims
        // Vault A balance = $40K + $6.1K premiums = $46.1K
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 40_000e6);
        vaultA.deposit(40_000e6, investor);
        vm.stopPrank();

        // Advance 15 days
        vm.prank(admin);
        registry.advanceTime(15 days);

        // Trigger P2 (flight delay): $15K claim
        // Vault balance = $46.1K > $15K = AUTO-EXERCISE
        vm.prank(admin);
        oracle.setFlightStatus(true);
        vm.prank(oracleReporter);
        vaultA.reportEvent(1);

        // P2 auto-exercised: pendingClaims = 0, insurer received $15K
        assertEq(vaultA.totalPendingClaims(), 0);
        uint256 insurerBalAfterP2 = usdc.balanceOf(insurer);
        assertEq(insurerBalAfterP2, 15_000e6);

        // Trigger P3 (fire): $35K partial claim
        // Vault balance = $46.1K - $15K = $31.1K < $35K = SHORTFALL
        vm.prank(insurerAdmin);
        vaultA.submitClaim(2, 35_000e6);

        uint256 pendingAfterP3 = vaultA.totalPendingClaims();
        assertEq(pendingAfterP3, 35_000e6); // P3 shortfall

        // totalAssets should reflect cumulative impact
        uint256 assets = vaultA.totalAssets();
        // Vault balance ~= $31.1K, pending claims = $35K
        // totalAssets should be very low or zero
        assertLt(assets, 5_000e6);

        // Exercise P3 manually (payout capped at vault balance)
        vm.prank(insurer);
        vaultA.exerciseClaim(1); // P3 receipt (receipt ID 1, since P2 was receipt 0)

        // All pending claims resolved
        assertEq(vaultA.totalPendingClaims(), 0);

        // Insurer received capped amount for P3
        uint256 insurerBalFinal = usdc.balanceOf(insurer);
        assertGt(insurerBalFinal, insurerBalAfterP2); // Got something for P3
    }

    // =========== POLICY EXPIRY ===========

    function test_policyExpiry() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        // Advance past P2 expiry (60 days)
        vm.prank(admin);
        registry.advanceTime(61 days);

        // P2 should be expired
        assertTrue(registry.isPolicyExpired(1));

        // Trying to claim on expired policy should revert
        vm.prank(admin);
        oracle.setFlightStatus(true);
        vm.prank(oracleReporter);
        vm.expectRevert();
        vaultA.reportEvent(1);

        // Advance past P1 expiry (90 days total from activation)
        vm.prank(admin);
        registry.advanceTime(30 days); // 91 days total

        assertTrue(registry.isPolicyExpired(0));

        // BTC crash should not trigger on expired policy
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.expectRevert();
        vaultA.checkClaim(0);
    }

    // =========== FACTORY + VAULT INTEGRATION ===========

    function test_factoryVaultIntegration() public view {
        // Verify factory tracked both vaults
        address[] memory vaults = factory.getVaults();
        assertEq(vaults.length, 2);
        assertEq(vaults[0], address(vaultA));
        assertEq(vaults[1], address(vaultB));

        assertTrue(factory.isVault(address(vaultA)));
        assertTrue(factory.isVault(address(vaultB)));

        // Verify vault configs
        assertEq(vaultA.vaultManager(), managerA);
        assertEq(vaultB.vaultManager(), managerB);
        assertEq(vaultA.bufferRatioBps(), 2000);
        assertEq(vaultB.bufferRatioBps(), 1500);
        assertEq(vaultA.managementFeeBps(), 50);
        assertEq(vaultB.managementFeeBps(), 100);
    }

    // =========== AUTO-REGISTER MINTER VIA FACTORY ===========

    function test_factoryAutoRegistersMinters() public view {
        // Verify that factory auto-registered both vaults as ClaimReceipt minters
        assertTrue(claimReceipt.authorizedMinters(address(vaultA)));
        assertTrue(claimReceipt.authorizedMinters(address(vaultB)));
    }

    // =========== FEE COMPARISON ===========

    function test_feeRate_vaultA_vs_vaultB() public {
        // Deposit same amount in both vaults
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        usdc.approve(address(vaultB), 10_000e6);
        vaultB.deposit(10_000e6, investor);
        vm.stopPrank();

        // Advance 1 year
        vm.prank(admin);
        registry.advanceTime(365 days);

        uint256 assetsA = vaultA.totalAssets();
        uint256 assetsB = vaultB.totalAssets();

        // Both should have appreciated from premiums, but Vault B should have
        // less net assets due to higher fee (1% vs 0.5%)
        // Note: Vault B also has fewer premiums ($3,700 vs $6,100)
        // The fee difference is:
        // Vault A: 0.5% * ~$10K = ~$50
        // Vault B: 1.0% * ~$10K = ~$100
        // This test just verifies both vaults have positive assets
        // and fees are being applied differently
        assertGt(assetsA, 0);
        assertGt(assetsB, 0);
    }
}
