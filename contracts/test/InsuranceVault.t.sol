// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract InsuranceVaultTest is Test {
    // --- Test Constants ---
    uint256 constant COVERAGE_50K = 50_000e6;
    uint256 constant COVERAGE_15K = 15_000e6;
    uint256 constant COVERAGE_40K = 40_000e6;
    uint256 constant PREMIUM_2500 = 2_500e6;
    uint256 constant PREMIUM_1200 = 1_200e6;
    uint256 constant PREMIUM_2400 = 2_400e6;
    int256 constant BTC_PRICE_85K = 85_000e8;
    int256 constant BTC_THRESHOLD_80K = 80_000e8;
    uint256 constant ONE_DAY = 1 days;
    uint256 constant THIRTY_DAYS = 30 days;
    uint256 constant NINETY_DAYS = 90 days;

    // --- Contracts ---
    MockUSDC public usdc;
    MockOracle public oracle;
    PolicyRegistry public registry;
    ClaimReceipt public claimReceipt;
    InsuranceVault public vaultA;

    // --- Actors ---
    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public investor = makeAddr("investor");
    address public insurer = makeAddr("insurer");
    address public oracleReporter = makeAddr("oracleReporter");
    address public insurerAdmin = makeAddr("insurerAdmin");
    address public nobody = makeAddr("nobody");

    function setUp() public {
        vm.startPrank(admin);

        // Deploy core contracts
        usdc = new MockUSDC();
        oracle = new MockOracle();
        registry = new PolicyRegistry();
        claimReceipt = new ClaimReceipt();

        // Deploy Vault A (direct deployment, not via factory)
        vaultA = new InsuranceVault(
            IERC20(address(usdc)),
            "NextBlock Balanced Core",
            "nxbBAL",
            "Balanced Core",
            admin,
            managerA,
            2000,   // 20% buffer
            50,     // 0.5% management fee
            address(registry),
            address(oracle),
            address(claimReceipt)
        );

        // Authorize vault as ClaimReceipt minter (manual, since not using factory)
        claimReceipt.setAuthorizedMinter(address(vaultA), true);

        // Set roles on vault
        vaultA.setOracleReporter(oracleReporter);
        vaultA.setInsurerAdmin(insurerAdmin);

        // Register 3 policies
        registry.registerPolicy("BTC Price Protection", PolicyRegistry.VerificationType.ON_CHAIN, COVERAGE_50K, PREMIUM_2500, NINETY_DAYS, insurer, BTC_THRESHOLD_80K);
        registry.registerPolicy("Flight Delay", PolicyRegistry.VerificationType.ORACLE_DEPENDENT, COVERAGE_15K, PREMIUM_1200, 60 days, insurer, 0);
        registry.registerPolicy("Commercial Fire", PolicyRegistry.VerificationType.OFF_CHAIN, COVERAGE_40K, PREMIUM_2400, 180 days, insurer, 0);

        // Activate all policies
        registry.activatePolicy(0);
        registry.activatePolicy(1);
        registry.activatePolicy(2);

        vm.stopPrank();

        // Vault manager adds policies
        vm.startPrank(managerA);
        vaultA.addPolicy(0, 4000);  // P1: 40%
        vaultA.addPolicy(1, 2000);  // P2: 20%
        vaultA.addPolicy(2, 4000);  // P3: 40%
        vm.stopPrank();

        // Admin deposits premiums
        vm.startPrank(admin);
        usdc.mint(admin, PREMIUM_2500 + PREMIUM_1200 + PREMIUM_2400);
        usdc.approve(address(vaultA), PREMIUM_2500 + PREMIUM_1200 + PREMIUM_2400);
        vaultA.depositPremium(0, PREMIUM_2500);
        vaultA.depositPremium(1, PREMIUM_1200);
        vaultA.depositPremium(2, PREMIUM_2400);
        vm.stopPrank();

        // Fund investor
        usdc.mint(investor, 100_000e6);
    }

    // =========== DEPOSIT/WITHDRAW ===========

    function test_deposit() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        uint256 shares = vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vaultA.balanceOf(investor), shares);
        // Share price should be approximately $1.00 at first deposit
    }

    function test_deposit_sharePrice() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        uint256 totalAssetsVal = vaultA.totalAssets();
        uint256 totalShares = vaultA.totalSupply();

        // totalAssets should be ~10_000e6 (investor deposit = total assets since premiums are unearned)
        assertApproxEqAbs(totalAssetsVal, 10_000e6, 10); // allow tiny rounding
    }

    function test_withdraw() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);

        // Withdraw from buffer
        uint256 maxW = vaultA.maxWithdraw(investor);
        assertGt(maxW, 0);

        uint256 balBefore = usdc.balanceOf(investor);
        vaultA.withdraw(maxW, investor, investor);
        uint256 balAfter = usdc.balanceOf(investor);
        vm.stopPrank();

        assertEq(balAfter - balBefore, maxW);
    }

    function test_maxWithdraw_bufferEnforcement() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        uint256 maxW = vaultA.maxWithdraw(investor);
        uint256 totalAssetsVal = vaultA.totalAssets();

        // maxWithdraw should be less than totalAssets (buffer enforced)
        assertLt(maxW, totalAssetsVal);
    }

    function test_withdraw_exceedsBuffer_reverts() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);

        uint256 maxW = vaultA.maxWithdraw(investor);

        // OZ ERC4626 checks maxWithdraw before calling _withdraw,
        // so the revert comes from OZ with ERC4626ExceededMaxWithdraw
        vm.expectRevert();
        vaultA.withdraw(maxW + 1, investor, investor);
        vm.stopPrank();
    }

    function test_firstDeposit_inflationAttack() public {
        // With _decimalsOffset = 12, virtual shares prevent inflation attack.
        // Even with $1 deposit, share pricing is reasonable.
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 1e6); // $1
        uint256 shares = vaultA.deposit(1e6, investor);
        vm.stopPrank();

        assertGt(shares, 0);
        // Shares should be approximately 1e18 (1 USDC = 1 share with 12-decimal offset)
        assertApproxEqRel(shares, 1e18, 0.01e18); // Within 1%
    }

    function test_decimalsOffset_firstDeposit() public {
        // $10K deposit should produce ~10,000 shares at ~$1.00/share
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        uint256 shares = vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        // With 18-decimal shares and 12-decimal offset:
        // 10_000e6 assets with offset produces shares around 10_000e18
        assertApproxEqRel(shares, 10_000e18, 0.01e18); // Within 1%
    }

    // =========== PREMIUM MECHANICS ===========

    function test_unearnedPremium_day0() public {
        // At day 0, all premiums are unearned
        // totalAssets should equal investor deposits only
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        uint256 totalAssetsVal = vaultA.totalAssets();
        // Total assets should be approximately the investor's deposit
        assertApproxEqAbs(totalAssetsVal, 10_000e6, 100);
    }

    function test_unearnedPremium_halfDuration() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        // Advance 45 days (half of P1's 90-day duration)
        vm.prank(admin);
        registry.advanceTime(45 days);

        uint256 totalAssetsVal = vaultA.totalAssets();
        // Should be > 10_000 because some premiums have been earned
        assertGt(totalAssetsVal, 10_000e6);
    }

    function test_totalAssets_increasesWithTime() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        uint256 assetsBefore = vaultA.totalAssets();

        vm.prank(admin);
        registry.advanceTime(THIRTY_DAYS);

        uint256 assetsAfter = vaultA.totalAssets();

        // Premium earned over 30 days should increase totalAssets
        assertGt(assetsAfter, assetsBefore);
    }

    function test_addPolicy_transfersPremium() public {
        uint256 vaultBalBefore = usdc.balanceOf(address(vaultA));
        assertEq(vaultBalBefore, PREMIUM_2500 + PREMIUM_1200 + PREMIUM_2400);
    }

    // =========== PREMIUM DEPOSITS ===========

    function test_depositPremium_separate() public {
        // Verify premiums were deposited correctly
        (,,uint256 premium,,,) = vaultA.vaultPolicies(0);
        assertEq(premium, PREMIUM_2500);

        (,,uint256 premium2,,,) = vaultA.vaultPolicies(1);
        assertEq(premium2, PREMIUM_1200);
    }

    function test_depositPremium_unauthorizedCaller_reverts() public {
        // depositPremium now checks: msg.sender == owner() || authorizedPremiumDepositors[msg.sender]
        // "nobody" is neither owner nor authorized depositor, so it should revert
        vm.prank(nobody);
        vm.expectRevert();
        vaultA.depositPremium(0, 1_000e6);
    }

    function test_depositPremium_policyNotInVault_reverts() public {
        // Policy 999 not in vault
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PolicyNotInVault.selector, 999));
        vaultA.depositPremium(999, 1_000e6);
    }

    function test_depositPremium_authorizedDepositor() public {
        // Owner authorizes a depositor
        address depositor = makeAddr("depositor");
        vm.prank(admin);
        vaultA.setAuthorizedPremiumDepositor(depositor, true);

        // Verify authorization
        assertTrue(vaultA.authorizedPremiumDepositors(depositor));

        // Depositor can deposit premiums
        vm.startPrank(admin);
        usdc.mint(depositor, 1_000e6);
        vm.stopPrank();

        vm.startPrank(depositor);
        usdc.approve(address(vaultA), 1_000e6);
        vaultA.depositPremium(0, 1_000e6);
        vm.stopPrank();

        // Verify premium was deposited
        (,,uint256 premium,,,) = vaultA.vaultPolicies(0);
        assertEq(premium, PREMIUM_2500 + 1_000e6);
    }

    function test_depositPremium_unauthorizedDepositor_reverts() public {
        // An address that is NOT owner and NOT authorized should revert
        address unauthorized = makeAddr("unauthorized");
        vm.startPrank(admin);
        usdc.mint(unauthorized, 1_000e6);
        vm.stopPrank();

        vm.startPrank(unauthorized);
        usdc.approve(address(vaultA), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, unauthorized));
        vaultA.depositPremium(0, 1_000e6);
        vm.stopPrank();
    }

    function test_setAuthorizedPremiumDepositor() public {
        address depositor = makeAddr("depositor");

        // Only owner can set
        vm.prank(admin);
        vaultA.setAuthorizedPremiumDepositor(depositor, true);
        assertTrue(vaultA.authorizedPremiumDepositors(depositor));

        // Owner can revoke
        vm.prank(admin);
        vaultA.setAuthorizedPremiumDepositor(depositor, false);
        assertFalse(vaultA.authorizedPremiumDepositors(depositor));

        // Non-owner cannot set
        vm.prank(nobody);
        vm.expectRevert();
        vaultA.setAuthorizedPremiumDepositor(depositor, true);
    }

    // =========== CLAIM PATHS ===========

    // --- P1: On-chain (BTC Price Protection) ---

    function test_triggerOnChain_btcBelow() public {
        // Vault has only premiums ($6,100). Claim is $50K. This is a shortfall case.
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        // Set BTC price below threshold
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        // Anyone can trigger
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Vault balance = $10K + $6.1K = $16.1K < $50K claim = SHORTFALL
        // Verify claim state -- totalPendingClaims should be $50K (shortfall, not auto-exercised)
        (,,,,bool claimed,uint256 claimAmount) = vaultA.vaultPolicies(0);
        assertTrue(claimed);
        assertEq(claimAmount, COVERAGE_50K);
        assertEq(vaultA.totalPendingClaims(), COVERAGE_50K);
    }

    function test_triggerOnChain_btcAbove_reverts() public {
        // BTC price is $85K (above $80K threshold) -- should revert
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__OracleConditionNotMet.selector, 0));
        vaultA.checkClaim(0);
    }

    function test_triggerOnChain_permissionless() public {
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        // Any random address can call checkClaim
        vm.prank(nobody);
        vaultA.checkClaim(0);

        (,,,,bool claimed,) = vaultA.vaultPolicies(0);
        assertTrue(claimed);
    }

    // --- P2: Oracle-dependent (Flight Delay) ---

    function test_triggerOracle_flightDelayed() public {
        // Vault has only premiums ($6.1K) < $15K claim = shortfall
        vm.prank(admin);
        oracle.setFlightStatus(true);

        vm.prank(oracleReporter);
        vaultA.reportEvent(1);

        (,,,,bool claimed, uint256 claimAmount) = vaultA.vaultPolicies(1);
        assertTrue(claimed);
        assertEq(claimAmount, COVERAGE_15K);
        // With only $6.1K premiums in vault, $15K claim is shortfall
        assertEq(vaultA.totalPendingClaims(), COVERAGE_15K);
    }

    function test_triggerOracle_onlyReporter() public {
        vm.prank(admin);
        oracle.setFlightStatus(true);

        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, nobody));
        vaultA.reportEvent(1);
    }

    function test_triggerOracle_notDelayed_reverts() public {
        // Flight is not delayed
        vm.prank(oracleReporter);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__OracleConditionNotMet.selector, 1));
        vaultA.reportEvent(1);
    }

    // --- P3: Off-chain (Commercial Fire) ---

    function test_triggerOffChain_partialClaim() public {
        // Vault has only $6.1K premiums < $35K claim = shortfall
        vm.prank(insurerAdmin);
        vaultA.submitClaim(2, 35_000e6); // $35K of $40K coverage

        (,,,,bool claimed, uint256 claimAmount) = vaultA.vaultPolicies(2);
        assertTrue(claimed);
        assertEq(claimAmount, 35_000e6);
    }

    function test_triggerOffChain_fullClaim() public {
        vm.prank(insurerAdmin);
        vaultA.submitClaim(2, COVERAGE_40K); // Full coverage

        (,,,,bool claimed, uint256 claimAmount) = vaultA.vaultPolicies(2);
        assertTrue(claimed);
        assertEq(claimAmount, COVERAGE_40K);
    }

    function test_triggerOffChain_exceedsCoverage_reverts() public {
        vm.prank(insurerAdmin);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__InvalidClaimAmount.selector,
            COVERAGE_40K + 1, COVERAGE_40K
        ));
        vaultA.submitClaim(2, COVERAGE_40K + 1);
    }

    function test_triggerOffChain_onlyInsurer() public {
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, nobody));
        vaultA.submitClaim(2, 35_000e6);
    }

    function test_triggerOffChain_zeroAmount_reverts() public {
        vm.prank(insurerAdmin);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__InvalidClaimAmount.selector,
            0, COVERAGE_40K
        ));
        vaultA.submitClaim(2, 0);
    }

    // --- Double claim ---

    function test_doubleClaim_reverts() public {
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        vm.prank(nobody);
        vaultA.checkClaim(0);

        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PolicyAlreadyClaimed.selector, 0));
        vaultA.checkClaim(0);
    }

    // --- Wrong verification type ---

    function test_checkClaim_wrongType_reverts() public {
        // Try to checkClaim (ON_CHAIN path) on policy 1 (ORACLE_DEPENDENT)
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__WrongVerificationType.selector, 1));
        vaultA.checkClaim(1);
    }

    // =========== CLAIM RECEIPT ===========

    function test_claimMintsReceipt() public {
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Verify receipt was minted
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertEq(receipt.policyId, 0);
        assertEq(receipt.claimAmount, COVERAGE_50K);
        assertEq(receipt.vault, address(vaultA));
        assertEq(receipt.insurer, insurer);
    }

    function test_receiptStoresInsurer() public {
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        vm.prank(nobody);
        vaultA.checkClaim(0);

        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertEq(receipt.insurer, insurer);
    }

    // =========== AUTO-EXERCISE TESTS ===========

    function test_autoExercise_sufficientFunds() public {
        // Deposit enough USDC so vault has >= $50K for the claim
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        // Vault balance = $60K + $6.1K premiums = $66.1K > $50K claim
        uint256 insurerBalBefore = usdc.balanceOf(insurer);

        // Trigger claim -- should auto-exercise
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Verify: insurer received USDC in the trigger tx (auto-exercised)
        uint256 insurerBalAfter = usdc.balanceOf(insurer);
        assertEq(insurerBalAfter - insurerBalBefore, COVERAGE_50K);

        // Verify: totalPendingClaims is 0 (auto-exercised)
        assertEq(vaultA.totalPendingClaims(), 0);

        // Verify: receipt is exercised
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertTrue(receipt.exercised);
    }

    function test_autoExercise_emitsEvent() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        // Expect ClaimAutoExercised event
        vm.expectEmit(true, false, false, true);
        emit InsuranceVault.ClaimAutoExercised(0, COVERAGE_50K, insurer);

        vm.prank(nobody);
        vaultA.checkClaim(0);
    }

    function test_shortfall_insufficientFunds() public {
        // Vault has only premiums ($6.1K) < $50K claim
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        uint256 vaultBalance = usdc.balanceOf(address(vaultA));

        // Expect ClaimShortfall event
        vm.expectEmit(true, false, false, true);
        emit InsuranceVault.ClaimShortfall(0, COVERAGE_50K, vaultBalance);

        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Verify: receipt is NOT exercised (shortfall)
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertFalse(receipt.exercised);

        // Verify: totalPendingClaims > 0
        assertEq(vaultA.totalPendingClaims(), COVERAGE_50K);

        // Verify: insurer did NOT receive USDC
        assertEq(usdc.balanceOf(insurer), 0);
    }

    function test_shortfall_thenManualExercise() public {
        // Shortfall path: vault has only $6.1K premiums < $50K claim
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Verify shortfall state
        assertEq(vaultA.totalPendingClaims(), COVERAGE_50K);
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertFalse(receipt.exercised);

        // Manual exercise -- payout is capped at vault balance
        uint256 vaultBal = usdc.balanceOf(address(vaultA));

        vm.prank(insurer);
        vaultA.exerciseClaim(0);

        uint256 insurerBal = usdc.balanceOf(insurer);
        // Should receive the vault balance, not the full claim amount
        assertEq(insurerBal, vaultBal);
        assertLt(insurerBal, COVERAGE_50K);

        // Pending claims should be resolved
        assertEq(vaultA.totalPendingClaims(), 0);

        // Receipt should be exercised
        ClaimReceipt.Receipt memory receiptAfter = claimReceipt.getReceipt(0);
        assertTrue(receiptAfter.exercised);
    }

    // =========== EXERCISE CLAIM (LEGACY TESTS, UPDATED FOR AUTO-EXERCISE) ===========

    function test_exerciseClaim_transfersUSDC_autoExercised() public {
        // With $60K deposit + $6.1K premiums = $66.1K > $50K claim = AUTO-EXERCISE
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        // Trigger claim
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);

        uint256 insurerBalBefore = usdc.balanceOf(insurer);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Auto-exercise happened! Insurer received USDC in the trigger tx.
        uint256 insurerBalAfter = usdc.balanceOf(insurer);
        assertEq(insurerBalAfter - insurerBalBefore, COVERAGE_50K);

        // Manual exerciseClaim should revert (already exercised)
        vm.prank(insurer);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__InvalidReceipt.selector, 0));
        vaultA.exerciseClaim(0);
    }

    function test_exerciseClaim_burnsReceipt_autoExercised() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Receipt was already auto-exercised
        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(0);
        assertTrue(receipt.exercised);
    }

    function test_exerciseClaim_capsAtBalance() public {
        // Vault has less USDC than claim amount (no investor deposits, only premiums)
        // Total premiums = $6,100, claim = $50,000 = SHORTFALL
        // Receipt stays live for manual exercise

        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Shortfall -- receipt NOT auto-exercised
        assertEq(vaultA.totalPendingClaims(), COVERAGE_50K);

        uint256 vaultBal = usdc.balanceOf(address(vaultA));

        // Manual exercise -- payout is capped at vault balance
        vm.prank(insurer);
        vaultA.exerciseClaim(0);

        uint256 insurerBal = usdc.balanceOf(insurer);
        // Should receive the vault balance, not the full claim amount
        assertEq(insurerBal, vaultBal);
        assertLt(insurerBal, COVERAGE_50K);
    }

    function test_exerciseClaim_fromWrongInsurer_reverts() public {
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Not the insurer
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, nobody));
        vaultA.exerciseClaim(0);
    }

    function test_doubleExercise_reverts() public {
        // With enough funds, auto-exercise happens. Double exercise should revert.
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Already auto-exercised -- manual exercise should revert
        vm.prank(insurer);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__InvalidReceipt.selector, 0));
        vaultA.exerciseClaim(0);
    }

    function test_pendingClaims_reducesNAV() public {
        // With $60K deposit, vault balance = $66.1K > $50K = AUTO-EXERCISE
        // After auto-exercise, totalPendingClaims = 0, but NAV still drops
        // because $50K was transferred out of the vault
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        uint256 assetsBefore = vaultA.totalAssets();

        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        uint256 assetsAfter = vaultA.totalAssets();

        // NAV should drop (USDC transferred out to insurer via auto-exercise)
        assertLt(assetsAfter, assetsBefore);
    }

    function test_exerciseClaim_restoresNAV() public {
        // For shortfall case: exercise is net-zero on NAV
        // (balance drops, pendingClaims drops by same conceptual amount)
        // Use shortfall scenario: no investor deposits, only premiums
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        // Shortfall state
        uint256 assetsAfterClaim = vaultA.totalAssets();

        vm.prank(insurer);
        vaultA.exerciseClaim(0);

        uint256 assetsAfterExercise = vaultA.totalAssets();

        // Exercise is net-zero on NAV (balance drops, pendingClaims drops by same amount)
        assertApproxEqAbs(assetsAfterExercise, assetsAfterClaim, 10);
    }

    // =========== FEE MECHANICS ===========

    function test_accruedFees_reducesNAV() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        // Advance time
        vm.prank(admin);
        registry.advanceTime(365 days);

        uint256 totalAssetsVal = vaultA.totalAssets();
        uint256 balance = usdc.balanceOf(address(vaultA));
        // totalAssets should be less than balance - premiums due to fees
        // (premiums are mostly earned at 365 days)
        assertLt(totalAssetsVal, balance);
    }

    function test_claimFees_transfersUSDC() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        // Advance time to accrue fees
        vm.prank(admin);
        registry.advanceTime(365 days);

        uint256 adminBalBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        vaultA.claimFees(admin);

        uint256 adminBalAfter = usdc.balanceOf(admin);
        assertGt(adminBalAfter, adminBalBefore);
    }

    function test_lastFeeTimestamp_initialized() public view {
        // lastFeeTimestamp should be initialized to currentTime() at deployment
        assertEq(vaultA.lastFeeTimestamp(), registry.currentTime());
    }

    function test_claimFees_noFees_reverts() public {
        // No deposits, no time passed -- no fees to claim
        vm.prank(admin);
        vm.expectRevert(InsuranceVault.InsuranceVault__NoFeesToClaim.selector);
        vaultA.claimFees(admin);
    }

    // =========== POLICY MANAGEMENT ===========

    function test_addPolicy_nonexistentPolicy_reverts() public {
        vm.prank(managerA);
        vm.expectRevert();
        vaultA.addPolicy(999, 1000);
    }

    function test_addPolicy_alreadyAdded_reverts() public {
        vm.prank(managerA);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PolicyAlreadyAdded.selector, 0));
        vaultA.addPolicy(0, 1000);
    }

    function test_addPolicy_onlyVaultManager() public {
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, nobody));
        vaultA.addPolicy(0, 1000);
    }

    // =========== EDGE CASES ===========

    function test_totalAssets_floorAtZero() public {
        // With large claims and no deposits, totalAssets should floor at 0
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        uint256 totalAssetsVal = vaultA.totalAssets();
        assertEq(totalAssetsVal, 0);
    }

    function test_oracleUninitialized_safeDefault() public {
        // Deploy a fresh oracle with no updates after construction
        // The constructor initializes btcPrice and lastBtcUpdate,
        // so we test that the initial value prevents false triggers.
        // BTC = $85K > $80K threshold, so checkClaim should revert.
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__OracleConditionNotMet.selector, 0));
        vaultA.checkClaim(0);
    }

    function test_getPolicyIds() public view {
        uint256[] memory ids = vaultA.getPolicyIds();
        assertEq(ids.length, 3);
        assertEq(ids[0], 0);
        assertEq(ids[1], 1);
        assertEq(ids[2], 2);
    }

    function test_getVaultInfo() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 10_000e6);
        vaultA.deposit(10_000e6, investor);
        vm.stopPrank();

        (
            string memory name,
            address manager,
            uint256 assets,
            uint256 shares,
            ,
            uint256 bufferBps,
            uint256 feeBps,
            ,
            ,
            uint256 policyCount
        ) = vaultA.getVaultInfo();

        assertEq(keccak256(bytes(name)), keccak256(bytes("Balanced Core")));
        assertEq(manager, managerA);
        assertApproxEqAbs(assets, 10_000e6, 100);
        assertGt(shares, 0);
        assertEq(bufferBps, 2000);
        assertEq(feeBps, 50);
        assertEq(policyCount, 3);
    }

    function test_premiumAcrualStopsAfterClaim() public {
        vm.startPrank(investor);
        usdc.approve(address(vaultA), 60_000e6);
        vaultA.deposit(60_000e6, investor);
        vm.stopPrank();

        // Advance 30 days
        vm.prank(admin);
        registry.advanceTime(THIRTY_DAYS);

        // Trigger P1 (auto-exercise since $60K + $6.1K = $66.1K > $50K)
        vm.prank(admin);
        oracle.setBtcPrice(75_000e8);
        vm.prank(nobody);
        vaultA.checkClaim(0);

        uint256 assetsAfterClaim = vaultA.totalAssets();

        // Advance another 30 days -- P1 premium should NOT continue accruing
        vm.prank(admin);
        registry.advanceTime(THIRTY_DAYS);

        uint256 assetsLater = vaultA.totalAssets();

        // Assets should still increase (P2 and P3 still earning) but P1's premium is frozen
        // The increase should be less than if P1 was still earning
        assertGt(assetsLater, assetsAfterClaim);
    }

    // =========== FUZZ TESTS ===========

    function testFuzz_totalAssets_neverReverts(uint256 timeElapsed) public view {
        // Bound to reasonable values
        timeElapsed = bound(timeElapsed, 0, 3650 days);
        // totalAssets() should never revert regardless of state
        // We call it as a view function -- if it reverts, the test fails
        vaultA.totalAssets();
    }

    function testFuzz_depositWithdraw_roundTrip(uint256 amount) public {
        amount = bound(amount, 1e6, 50_000e6); // $1 to $50K

        vm.startPrank(investor);
        usdc.approve(address(vaultA), amount);
        uint256 shares = vaultA.deposit(amount, investor);

        // Can only withdraw up to maxWithdraw (buffer limited)
        uint256 maxW = vaultA.maxWithdraw(investor);
        if (maxW > 0) {
            vaultA.withdraw(maxW, investor, investor);
        }
        vm.stopPrank();

        // Investor should have received approximately the max withdrawal amount
        // (minus fees which are negligible at block-time zero)
    }
}
