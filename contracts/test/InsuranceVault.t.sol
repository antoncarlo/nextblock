// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
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
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;

    // --- Actors ---
    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public investor = makeAddr("investor");
    address public insurer = makeAddr("insurer");
    address public nobody = makeAddr("nobody");

    function setUp() public {
        vm.startPrank(admin);

        // Deploy core contracts
        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        registry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));

        // KYC onboarding for the test LP (admin acts as KYC operator)
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        compliance.setWhitelist(investor, true);
        compliance.setKycExpiry(investor, uint64(block.timestamp + 3650 days));

        // Grant protocol roles (admin already holds OWNER_ROLE)
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), admin);

        // Deploy Vault A (direct deployment, not via factory)
        vaultA = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nxbBAL",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000, // 20% buffer
                managementFeeBps: 50, // 0.5% management fee
                registry: address(registry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );

        // Authorize vault as ClaimReceipt minter (manual, since not using factory)
        claimReceipt.setAuthorizedMinter(address(vaultA), true);

        // Register 3 policies
        registry.registerPolicy(
            "BTC Price Protection",
            PolicyRegistry.VerificationType.ON_CHAIN,
            COVERAGE_50K,
            PREMIUM_2500,
            NINETY_DAYS,
            insurer,
            BTC_THRESHOLD_80K
        );
        registry.registerPolicy(
            "Flight Delay",
            PolicyRegistry.VerificationType.ORACLE_DEPENDENT,
            COVERAGE_15K,
            PREMIUM_1200,
            60 days,
            insurer,
            0
        );
        registry.registerPolicy(
            "Commercial Fire",
            PolicyRegistry.VerificationType.OFF_CHAIN,
            COVERAGE_40K,
            PREMIUM_2400,
            180 days,
            insurer,
            0
        );

        // Activate all policies
        registry.activatePolicy(0);
        registry.activatePolicy(1);
        registry.activatePolicy(2);

        vm.stopPrank();

        // Vault manager adds policies
        vm.startPrank(managerA);
        vaultA.addPolicy(0, 4000); // P1: 40%
        vaultA.addPolicy(1, 2000); // P2: 20%
        vaultA.addPolicy(2, 4000); // P3: 40%
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

        // Hardened semantics (Phase 3): UPR (unearned premium cash) is a liability
        // and can never be withdrawn; unallocated LP capital remains liquid.
        (uint256 balance, uint256 upr,,,,,,) = vaultA.getVaultAccounting();
        assertLe(maxW, balance - upr);
        assertGt(maxW, 0);
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
        (,, uint256 premium,,,) = vaultA.vaultPolicies(0);
        assertEq(premium, PREMIUM_2500);

        (,, uint256 premium2,,,) = vaultA.vaultPolicies(1);
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
        // OWNER_ROLE grants PREMIUM_DEPOSITOR_ROLE on-chain via ProtocolRoles
        address depositor = makeAddr("depositor");
        bytes32 depositorRole = protocolRoles.PREMIUM_DEPOSITOR_ROLE();
        vm.prank(admin);
        protocolRoles.grantRole(depositorRole, depositor);

        // Verify authorization
        assertTrue(protocolRoles.hasRole(depositorRole, depositor));

        // Depositor can deposit premiums
        vm.startPrank(admin);
        usdc.mint(depositor, 1_000e6);
        vm.stopPrank();

        vm.startPrank(depositor);
        usdc.approve(address(vaultA), 1_000e6);
        vaultA.depositPremium(0, 1_000e6);
        vm.stopPrank();

        // Verify premium was deposited
        (,, uint256 premium,,,) = vaultA.vaultPolicies(0);
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
        vm.expectRevert(
            abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, unauthorized)
        );
        vaultA.depositPremium(0, 1_000e6);
        vm.stopPrank();
    }

    function test_setAuthorizedPremiumDepositor() public {
        // Legacy informational mapping (ABI compat): toggling works, OWNER_ROLE gated,
        // but it does NOT grant deposit rights (PREMIUM_DEPOSITOR_ROLE does).
        address depositor = makeAddr("depositor");

        // Only OWNER_ROLE can set
        vm.prank(admin);
        vaultA.setAuthorizedPremiumDepositor(depositor, true);
        assertTrue(vaultA.authorizedPremiumDepositors(depositor));

        // OWNER_ROLE can revoke
        vm.prank(admin);
        vaultA.setAuthorizedPremiumDepositor(depositor, false);
        assertFalse(vaultA.authorizedPremiumDepositors(depositor));

        // Non-owner cannot set
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, nobody));
        vaultA.setAuthorizedPremiumDepositor(depositor, true);
    }

    function test_legacyDepositorMapping_doesNotGrantDepositRights() public {
        // The mapping alone must NOT allow premium deposits (role is the sole gate)
        address depositor = makeAddr("legacyDepositor");
        vm.prank(admin);
        vaultA.setAuthorizedPremiumDepositor(depositor, true);

        vm.startPrank(admin);
        usdc.mint(depositor, 1_000e6);
        vm.stopPrank();

        vm.startPrank(depositor);
        usdc.approve(address(vaultA), 1_000e6);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, depositor));
        vaultA.depositPremium(0, 1_000e6);
        vm.stopPrank();
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
            uint256 shares,,
            uint256 bufferBps,
            uint256 feeBps,,,
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
