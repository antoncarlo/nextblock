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

/// @title InsuranceVaultHardeningTest
/// @notice Phase 3 suite: compliance gating on nbUSDC (mint/transfer/burn),
///         deposit cap, investor limit, portfolio allocation with capacity and
///         coverage bounds, UPR/claim reserve withdrawal protection.
contract InsuranceVaultHardeningTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public allocator = makeAddr("allocator");
    address public cedant = makeAddr("cedant");
    address public sentinel = makeAddr("sentinel");
    address public lp = makeAddr("institutionalLP");
    address public lp2 = makeAddr("institutionalLP2");
    address public outsider = makeAddr("outsider");

    uint64 public kycExpiry;

    uint256 constant BUFFER_2000 = 2000; // 20%
    uint256 constant FEE_50 = 50; // 0.5%
    uint256 constant COVERAGE_100K = 100_000e6;
    uint256 constant PREMIUM_10K = 10_000e6;

    function setUp() public {
        vm.startPrank(admin);

        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));

        // Roles
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), allocator);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);

        // KYC onboarding
        kycExpiry = uint64(block.timestamp + 3650 days);
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, kycExpiry);
        compliance.setWhitelist(lp2, true);
        compliance.setKycExpiry(lp2, kycExpiry);

        // Vault (direct deployment)
        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Balanced Core",
                symbol: "nbUSDC-BAL",
                vaultName: "Balanced Core",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: BUFFER_2000,
                managementFeeBps: FEE_50,
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);

        // Phase 9.5: allocations are restricted to the bound vaultAllocator.
        // This unit suite tests the VAULT mechanics directly, so the binding
        // points to the allocator EOA (the strategy-layer integration is
        // covered by VaultAllocator.t.sol and the invariant suite).
        vault.setVaultAllocator(allocator);

        vm.stopPrank();

        // Funding
        vm.startPrank(admin);
        usdc.mint(lp, 1_000_000e6);
        usdc.mint(lp2, 1_000_000e6);
        usdc.mint(outsider, 1_000_000e6);
        vm.stopPrank();
    }

    // --- Helpers ---

    function _approvedPortfolio() internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT QS 2026",
                metadataURI: "ipfs://QmDocs",
                documentHash: keccak256("docs"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE_100K,
                cededPremium: PREMIUM_10K,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.prank(admin);
        portfolioRegistry.startReview(pid);
        vm.prank(admin);
        portfolioRegistry.approvePortfolio(pid, 6_500); // expectedLossBps mock (declared residual risk)
    }

    function _deposit(address who, uint256 amount) internal {
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.deposit(amount, who);
        vm.stopPrank();
    }

    // =========== COMPLIANCE GATING (nbUSDC) ===========

    function test_deposit_whitelistedLP_succeeds() public {
        _deposit(lp, 10_000e6);
        assertGt(vault.balanceOf(lp), 0);
    }

    function test_deposit_nonWhitelisted_reverts() public {
        vm.startPrank(outsider);
        usdc.approve(address(vault), 10_000e6);
        assertEq(vault.maxDeposit(outsider), 0);
        vm.expectRevert(); // ERC4626ExceededMaxDeposit (maxDeposit = 0)
        vault.deposit(10_000e6, outsider);
        vm.stopPrank();
    }

    function test_deposit_kycExpired_reverts() public {
        vm.warp(uint256(kycExpiry) + 1);
        vm.startPrank(lp);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert();
        vault.deposit(10_000e6, lp);
        vm.stopPrank();
    }

    function test_shareTransfer_toNonWhitelisted_reverts() public {
        _deposit(lp, 10_000e6);
        uint256 shares = vault.balanceOf(lp);

        vm.prank(lp);
        vm.expectRevert(
            abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__ReceiverNotWhitelisted.selector, outsider)
        );
        vault.transfer(outsider, shares);
    }

    function test_shareTransfer_betweenWhitelisted_succeeds() public {
        _deposit(lp, 10_000e6);
        uint256 shares = vault.balanceOf(lp);

        vm.prank(lp);
        vault.transfer(lp2, shares);
        assertEq(vault.balanceOf(lp2), shares);
    }

    function test_blockedLP_frozen_cannotWithdrawOrTransfer() public {
        _deposit(lp, 10_000e6);

        vm.prank(sentinel);
        compliance.setBlocked(lp, true);

        assertEq(vault.maxWithdraw(lp), 0);

        vm.prank(lp);
        vm.expectRevert(abi.encodeWithSelector(ComplianceRegistry.ComplianceRegistry__AddressBlocked.selector, lp));
        vault.transfer(lp2, 1);

        // Direct withdraw also blocked at the share-burn hook
        vm.prank(lp);
        vm.expectRevert();
        vault.withdraw(1e6, lp, lp);
    }

    function test_dewhitelistedLP_canStillExit() public {
        _deposit(lp, 10_000e6);

        // KYC downgrade (not a sanction): LP must still be able to redeem
        vm.prank(admin);
        compliance.setWhitelist(lp, false);

        uint256 maxW = vault.maxWithdraw(lp);
        assertGt(maxW, 0);

        uint256 balBefore = usdc.balanceOf(lp);
        vm.prank(lp);
        vault.withdraw(maxW, lp, lp);
        assertEq(usdc.balanceOf(lp) - balBefore, maxW);
    }

    // =========== DEPOSIT CAP & INVESTOR LIMIT ===========

    function test_depositCap_enforced() public {
        vm.prank(admin);
        vault.setDepositCap(15_000e6);

        _deposit(lp, 10_000e6);
        assertLe(vault.maxDeposit(lp2), 5_000e6 + 1); // ~remaining cap (rounding tolerance)

        vm.startPrank(lp2);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert(); // exceeds remaining cap
        vault.deposit(10_000e6, lp2);
        vm.stopPrank();
    }

    function test_depositCap_onlyOwnerRole() public {
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, outsider));
        vault.setDepositCap(1);
    }

    function test_depositCap_event() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit InsuranceVault.DepositCapUpdated(42_000e6);
        vault.setDepositCap(42_000e6);
        assertEq(vault.depositCap(), 42_000e6);
    }

    function test_investorLimit_enforced() public {
        vm.prank(admin);
        compliance.setInvestorLimit(lp, 5_000e6);

        assertEq(vault.maxDeposit(lp), 5_000e6);
        _deposit(lp, 5_000e6);

        // At limit: nothing more
        assertLe(vault.maxDeposit(lp), 1); // rounding tolerance
        vm.startPrank(lp);
        usdc.approve(address(vault), 1_000e6);
        vm.expectRevert();
        vault.deposit(1_000e6, lp);
        vm.stopPrank();

        // Other LP unaffected (limit 0 = unlimited)
        _deposit(lp2, 10_000e6);
    }

    // =========== PORTFOLIO ALLOCATION ===========

    function test_allocate_onlyBoundVaultAllocator() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);

        // Phase 9.5: even the curator cannot allocate directly
        vm.prank(managerA);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotVaultAllocator.selector, managerA));
        vault.allocateToPortfolio(pid, 10_000e6);

        // ...and neither can an EOA that merely holds ALLOCATOR_ROLE without
        // being the bound vaultAllocator (direct-role bypass closed).
        address roleOnly = makeAddr("roleOnlyAllocator");
        bytes32 allocRole = protocolRoles.ALLOCATOR_ROLE();
        vm.prank(admin);
        protocolRoles.grantRole(allocRole, roleOnly);
        vm.prank(roleOnly);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__NotVaultAllocator.selector, roleOnly));
        vault.allocateToPortfolio(pid, 10_000e6);
    }

    function test_allocate_approvedPortfolio_succeeds() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);

        uint256 capacity = vault.underwritingCapacity();
        assertEq(capacity, 80_000e6); // (100K - 0 liabilities) * 80%

        vm.prank(allocator);
        vm.expectEmit(true, false, false, true);
        emit InsuranceVault.PortfolioAllocated(pid, 50_000e6, 50_000e6);
        vault.allocateToPortfolio(pid, 50_000e6);

        assertEq(vault.portfolioAllocation(pid), 50_000e6);
        assertEq(vault.totalPortfolioAllocated(), 50_000e6);
        assertEq(vault.underwritingCapacity(), 30_000e6);

        uint256[] memory ids = vault.getAllocatedPortfolios();
        assertEq(ids.length, 1);
        assertEq(ids[0], pid);
    }

    function test_allocate_submittedPortfolio_reverts() public {
        vm.prank(cedant);
        uint256 pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Pending Treaty",
                metadataURI: "ipfs://x",
                documentHash: keccak256("x"),
                lineOfBusiness: "Marine",
                jurisdiction: "UK",
                structureType: PortfolioRegistry.StructureType.XOL,
                coverageLimit: COVERAGE_100K,
                cededPremium: PREMIUM_10K,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        _deposit(lp, 100_000e6);

        vm.prank(allocator);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PortfolioNotAllocatable.selector, pid));
        vault.allocateToPortfolio(pid, 10_000e6);
    }

    function test_allocate_pausedPortfolio_reverts() public {
        uint256 pid = _approvedPortfolio();
        vm.prank(admin);
        portfolioRegistry.activatePortfolio(pid);
        vm.prank(sentinel);
        portfolioRegistry.pausePortfolio(pid);

        _deposit(lp, 100_000e6);
        vm.prank(allocator);
        vm.expectRevert(abi.encodeWithSelector(InsuranceVault.InsuranceVault__PortfolioNotAllocatable.selector, pid));
        vault.allocateToPortfolio(pid, 10_000e6);
    }

    function test_allocate_exceedsCapacity_reverts() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);

        uint256 capacity = vault.underwritingCapacity(); // 80K
        vm.prank(allocator);
        vm.expectRevert(
            abi.encodeWithSelector(
                InsuranceVault.InsuranceVault__AllocationExceedsCapacity.selector, capacity + 1, capacity
            )
        );
        vault.allocateToPortfolio(pid, capacity + 1);
    }

    function test_allocate_exceedsCoverageLimit_reverts() public {
        uint256 pid = _approvedPortfolio(); // coverage 100K
        _deposit(lp, 200_000e6); // capacity 160K > coverage

        vm.prank(allocator);
        vault.allocateToPortfolio(pid, COVERAGE_100K); // fill coverage

        vm.prank(allocator);
        vm.expectRevert(
            abi.encodeWithSelector(
                InsuranceVault.InsuranceVault__AllocationExceedsCoverage.selector,
                pid,
                COVERAGE_100K + 1e6,
                COVERAGE_100K
            )
        );
        vault.allocateToPortfolio(pid, 1e6);
    }

    function test_deallocate_releasesBuffer_evenWhenPaused() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);

        vm.prank(allocator);
        vault.allocateToPortfolio(pid, 50_000e6);

        // Pause portfolio (sentinel risk action): deallocation must still work
        vm.prank(admin);
        portfolioRegistry.activatePortfolio(pid);
        vm.prank(sentinel);
        portfolioRegistry.pausePortfolio(pid);

        uint256 maxWBefore = vault.maxWithdraw(lp);

        vm.prank(allocator);
        vm.expectEmit(true, false, false, true);
        emit InsuranceVault.PortfolioDeallocated(pid, 50_000e6, 0);
        vault.deallocateFromPortfolio(pid, 50_000e6);

        assertEq(vault.totalPortfolioAllocated(), 0);
        assertGt(vault.maxWithdraw(lp), maxWBefore);
    }

    function test_deallocate_exceedsAllocation_reverts() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);
        vm.prank(allocator);
        vault.allocateToPortfolio(pid, 10_000e6);

        vm.prank(allocator);
        vm.expectRevert(
            abi.encodeWithSelector(
                InsuranceVault.InsuranceVault__DeallocationExceedsAllocation.selector, pid, 10_000e6 + 1, 10_000e6
            )
        );
        vault.deallocateFromPortfolio(pid, 10_000e6 + 1);
    }

    // =========== RESERVES & WITHDRAWAL PROTECTION ===========

    function test_withdraw_cannotConsumeAllocatedCapital() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);

        vm.prank(allocator);
        vault.allocateToPortfolio(pid, 80_000e6); // full capacity

        // Withdrawable = balance - allocated = 100K - 80K = 20K (buffer)
        uint256 maxW = vault.maxWithdraw(lp);
        assertEq(maxW, 20_000e6);

        vm.prank(lp);
        vm.expectRevert(); // exceeds maxWithdraw
        vault.withdraw(20_000e6 + 1e6, lp, lp);
    }

    function test_withdraw_cannotConsumeUPR() public {
        // Premium cash in the vault is a liability until earned
        vm.startPrank(admin);
        uint256 polId = policyRegistry.currentTime() >= 0 ? 0 : 0; // placeholder to keep stack flat
        vm.stopPrank();

        // Register + activate a legacy policy and fund its premium
        vm.prank(cedant);
        polId = policyRegistry.registerPolicy(
            "Treaty Premium", PolicyRegistry.VerificationType.OFF_CHAIN, 50_000e6, PREMIUM_10K, 180 days, cedant, 0
        );
        vm.prank(admin);
        policyRegistry.activatePolicy(polId);
        vm.prank(managerA);
        vault.addPolicy(polId, 10_000);

        vm.startPrank(admin);
        usdc.mint(admin, PREMIUM_10K);
        usdc.approve(address(vault), PREMIUM_10K);
        vault.depositPremium(polId, PREMIUM_10K);
        vm.stopPrank();

        _deposit(lp, 10_000e6);

        // balance = 20K; UPR = 10K (day 0); no auto-deployed capital (Phase 3)
        // available buffer = 20K - 10K = 10K: UPR cash is NOT withdrawable
        uint256 maxW = vault.maxWithdraw(lp);
        assertApproxEqAbs(maxW, 10_000e6, 10); // share-rounding tolerance
        (uint256 balance, uint256 upr,,,,,,) = vault.getVaultAccounting();
        assertLe(maxW, balance - upr);
    }

    function test_getVaultAccounting_consistent() public {
        uint256 pid = _approvedPortfolio();
        _deposit(lp, 100_000e6);
        vm.prank(allocator);
        vault.allocateToPortfolio(pid, 30_000e6);

        (
            uint256 balance,
            uint256 upr,
            uint256 pendingClaims,
            uint256 deployedCapital,
            uint256 portfolioAllocated,
            uint256 availableBuffer,
            uint256 capacity,
            uint256 cap
        ) = vault.getVaultAccounting();

        assertEq(balance, 100_000e6);
        assertEq(upr, 0);
        assertEq(pendingClaims, 0);
        assertEq(deployedCapital, 0);
        assertEq(portfolioAllocated, 30_000e6);
        assertEq(availableBuffer, 70_000e6);
        assertEq(capacity, 50_000e6);
        assertEq(cap, vault.UNCAPPED());
    }

    // =========== PARAMETRIC BOUNDS ===========

    function test_constructor_bufferBelowMinimum_reverts() public {
        InsuranceVault.VaultInitParams memory p = _initParams();
        p.bufferRatioBps = vault.MIN_BUFFER_RATIO_BPS() - 1;
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        new InsuranceVault(p);
    }

    function test_constructor_feeAboveMaximum_reverts() public {
        InsuranceVault.VaultInitParams memory p = _initParams();
        p.managementFeeBps = vault.MAX_MANAGEMENT_FEE_BPS() + 1;
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        new InsuranceVault(p);
    }

    function test_constructor_missingRegistries_revert() public {
        InsuranceVault.VaultInitParams memory p = _initParams();
        p.complianceRegistry = address(0);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        new InsuranceVault(p);

        p = _initParams();
        p.portfolioRegistry = address(0);
        vm.expectRevert(InsuranceVault.InsuranceVault__InvalidParams.selector);
        new InsuranceVault(p);
    }

    function _initParams() internal view returns (InsuranceVault.VaultInitParams memory) {
        return InsuranceVault.VaultInitParams({
            asset: IERC20(address(usdc)),
            name: "Test Vault",
            symbol: "nbUSDC-T",
            vaultName: "Test",
            owner: admin,
            vaultManager: managerA,
            bufferRatioBps: BUFFER_2000,
            managementFeeBps: FEE_50,
            registry: address(policyRegistry),
            oracle: address(oracle),
            claimReceipt: address(claimReceipt),
            protocolRoles: address(protocolRoles),
            complianceRegistry: address(compliance),
            portfolioRegistry: address(portfolioRegistry)
        });
    }

    // =========== FUZZ ===========

    function testFuzz_allocation_neverExceedsCapacity(uint256 depositAmt, uint256 allocAmt) public {
        depositAmt = bound(depositAmt, 1_000e6, 500_000e6);
        uint256 pid = _approvedPortfolio();
        _deposit(lp, depositAmt);

        uint256 capacity = vault.underwritingCapacity();
        allocAmt = bound(allocAmt, 1, capacity > 0 ? capacity : 1);

        if (capacity == 0 || allocAmt > COVERAGE_100K) return;

        vm.prank(allocator);
        vault.allocateToPortfolio(pid, allocAmt);

        // Invariant: committed capital never exceeds investable share of free capital
        assertLe(
            vault.totalPortfolioAllocated() + vault.totalDeployedCapital(),
            depositAmt * (10_000 - BUFFER_2000) / 10_000 + 1
        );
        // Withdrawals capped by remaining liquidity
        assertLe(vault.maxWithdraw(lp), depositAmt - allocAmt + 1);
    }
}
