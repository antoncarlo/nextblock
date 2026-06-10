// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../../src/ClaimReceipt.sol";
import {MockUSDC} from "../../src/MockUSDC.sol";
import {MockOracle} from "../../src/MockOracle.sol";
import {InsuranceVault} from "../../src/InsuranceVault.sol";
import {PremiumDistributor} from "../../src/PremiumDistributor.sol";
import {VaultAllocator} from "../../src/VaultAllocator.sol";
import {AIAssessor} from "../../src/AIAssessor.sol";
import {ClaimManager} from "../../src/ClaimManager.sol";

/// @title VaultHandler
/// @notice Bounded-action handler for stateful invariant testing of the hardened
///         InsuranceVault: LP deposits/withdrawals, premium receipts, portfolio
///         allocation/deallocation and time warps. Tracks ghost variables for
///         USDC conservation.
contract VaultHandler is Test {
    InsuranceVault public vault;
    MockUSDC public usdc;
    PolicyRegistry public policyRegistry;
    PortfolioRegistry public portfolioRegistry;
    PremiumDistributor public distributor;
    VaultAllocator public vaultAllocator;
    ClaimManager public claimManager;

    address public admin;
    address public committee;
    address public allocator;
    address public cedant;
    address[] public lps;
    uint256[] public portfolioIds;
    uint256 public legacyPolicyId;

    // --- Ghost variables ---
    uint256 public ghost_deposited;
    uint256 public ghost_withdrawn;
    uint256 public ghost_premiums;
    uint256 public ghost_payouts;

    /// @dev Packed config to stay within legacy-codegen stack limits.
    struct HandlerConfig {
        InsuranceVault vault;
        MockUSDC usdc;
        PolicyRegistry policyRegistry;
        PortfolioRegistry portfolioRegistry;
        PremiumDistributor distributor;
        VaultAllocator vaultAllocator;
        ClaimManager claimManager;
        address admin;
        address committee;
        address allocator;
        address cedant;
        address[] lps;
        uint256[] portfolioIds;
        uint256 legacyPolicyId;
    }

    constructor(HandlerConfig memory c) {
        vault = c.vault;
        usdc = c.usdc;
        policyRegistry = c.policyRegistry;
        portfolioRegistry = c.portfolioRegistry;
        distributor = c.distributor;
        vaultAllocator = c.vaultAllocator;
        claimManager = c.claimManager;
        admin = c.admin;
        committee = c.committee;
        allocator = c.allocator;
        cedant = c.cedant;
        lps = c.lps;
        portfolioIds = c.portfolioIds;
        legacyPolicyId = c.legacyPolicyId;
    }

    function deposit(uint256 actorSeed, uint256 amount) external {
        address lp = lps[actorSeed % lps.length];
        uint256 maxDep = vault.maxDeposit(lp);
        if (maxDep == 0) return;
        amount = bound(amount, 1e6, 200_000e6);
        if (amount > maxDep) amount = maxDep;

        vm.startPrank(admin);
        usdc.mint(lp, amount);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), amount);
        vault.deposit(amount, lp);
        vm.stopPrank();

        ghost_deposited += amount;
    }

    function withdraw(uint256 actorSeed, uint256 amount) external {
        address lp = lps[actorSeed % lps.length];
        uint256 maxW = vault.maxWithdraw(lp);
        if (maxW == 0) return;
        amount = bound(amount, 1, maxW);

        vm.prank(lp);
        vault.withdraw(amount, lp, lp);

        ghost_withdrawn += amount;
    }

    function depositPremium(uint256 amount) external {
        amount = bound(amount, 1e6, 50_000e6);

        vm.startPrank(admin);
        usdc.mint(admin, amount);
        usdc.approve(address(vault), amount);
        vault.depositPremium(legacyPolicyId, amount);
        vm.stopPrank();

        ghost_premiums += amount;
    }

    function premiumViaDistributor(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        amount = bound(amount, 1e6, 50_000e6);

        vm.startPrank(admin);
        usdc.mint(cedant, amount);
        vm.stopPrank();

        uint256 vaultBefore = usdc.balanceOf(address(vault));

        vm.startPrank(cedant);
        usdc.approve(address(distributor), amount);
        distributor.receivePremium(pid, amount);
        vm.stopPrank();

        // Ghost tracks the LP quota actually received by the vault.
        ghost_premiums += usdc.balanceOf(address(vault)) - vaultBefore;
    }

    // Phase 9.5: direct vault allocation is closed; allocations flow only via
    // the VaultAllocator proposal lifecycle (allocateViaAllocator below).

    function allocateViaAllocator(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 maxAlloc = _maxAllocatorRoom(pid);
        if (maxAlloc == 0) return;

        amount = bound(amount, 1, maxAlloc);

        vm.prank(allocator);
        uint256 propId = vaultAllocator.proposeAllocation(address(vault), pid, amount);
        vm.prank(allocator);
        vaultAllocator.executeAllocation(propId);
    }

    /// @dev Max amount satisfying vault capacity, allocator concentration and coverage.
    function _maxAllocatorRoom(uint256 pid) internal view returns (uint256 maxAlloc) {
        maxAlloc = vault.underwritingCapacity();
        if (maxAlloc == 0) return 0;

        uint256 current = vault.portfolioAllocation(pid);
        uint256 limit = vaultAllocator.investableBase(address(vault))
            * vaultAllocator.maxPortfolioConcentrationBps() / 10_000;
        if (current >= limit) return 0;
        if (limit - current < maxAlloc) maxAlloc = limit - current;

        uint256 coverageRoom = portfolioRegistry.getPortfolio(pid).coverageLimit - current;
        if (coverageRoom < maxAlloc) maxAlloc = coverageRoom;

        // Per-cedant concentration room (both invariant portfolios share a cedant).
        address pfCedant = portfolioRegistry.getPortfolio(pid).cedant;
        uint256 cedantLimit = vaultAllocator.investableBase(address(vault))
            * vaultAllocator.maxCedantConcentrationBps() / 10_000;
        uint256 cedantExp = vaultAllocator.cedantExposure(address(vault), pfCedant);
        if (cedantExp >= cedantLimit) return 0;
        if (cedantLimit - cedantExp < maxAlloc) maxAlloc = cedantLimit - cedantExp;
    }

    function deallocate(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];
        uint256 allocated = vault.portfolioAllocation(pid);
        if (allocated == 0) return;

        amount = bound(amount, 1, allocated);
        vm.prank(allocator);
        uint256 propId = vaultAllocator.proposeDeallocation(address(vault), pid, amount);
        vm.prank(allocator);
        vaultAllocator.executeAllocation(propId);
    }

    /// @dev Full parametric claim flow: submit (cedant) -> committee approve ->
    ///      execute. PARAMETRIC path keeps the handler warp-free; the committee
    ///      remains the only approver. Bounded by the vault's free funds so the
    ///      insolvency guard cannot revert the run (fail_on_revert = true).
    function claimFlow(uint256 pidSeed, uint256 amount) external {
        uint256 pid = portfolioIds[pidSeed % portfolioIds.length];

        // Free funds = balance - UPR - existing reserves (vault insolvency rule)
        (uint256 balance, uint256 upr, uint256 pendingClaims,,,,,) = vault.getVaultAccounting();
        uint256 liabilities = upr + pendingClaims;
        if (balance <= liabilities) return;
        uint256 freeFunds = balance - liabilities;

        PortfolioRegistry.Portfolio memory pf = portfolioRegistry.getPortfolio(pid);
        uint256 maxClaim = freeFunds < pf.coverageLimit ? freeFunds : pf.coverageLimit;
        if (maxClaim == 0) return;
        amount = bound(amount, 1, maxClaim);

        vm.prank(cedant);
        uint256 claimId = claimManager.submitClaim(
            address(vault), pid, amount, ClaimManager.ClaimType.PARAMETRIC, keccak256(abi.encode(claimId_salt++))
        );

        vm.prank(committee);
        claimManager.approveClaim(claimId, amount);

        claimManager.executeClaim(claimId);
        ghost_payouts += amount;
    }

    uint256 private claimId_salt = 1;

    function warp(uint256 secs) external {
        secs = bound(secs, 1 hours, 30 days);
        vm.warp(block.timestamp + secs);
    }
}

/// @title VaultInvariantTest
/// @notice Phase 3 stateful invariants: USDC conservation, UPR bounded by received
///         premiums, per-portfolio allocation bounded by coverage, withdrawals
///         bounded by the liquidity buffer, totalAssets() total safety.
/// forge-config: default.invariant.runs = 64
/// forge-config: default.invariant.depth = 48
/// forge-config: default.invariant.fail-on-revert = true
contract VaultInvariantTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;
    PremiumDistributor public distributor;
    VaultAllocator public vaultAllocator;
    AIAssessor public assessor;
    ClaimManager public claimManagerC;
    VaultHandler public handler;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public allocator = makeAddr("allocator");
    address public cedant = makeAddr("cedant");
    address public committee = makeAddr("committee");

    uint256[] public portfolioIds;

    uint256 constant COVERAGE_A = 150_000e6;
    uint256 constant COVERAGE_B = 60_000e6;

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
        // Advisory oracle disabled (address(0)): documented MVP configuration.
        vaultAllocator = new VaultAllocator(
            address(protocolRoles), address(portfolioRegistry), address(0)
        );
        assessor = new AIAssessor(address(protocolRoles));
        claimManagerC = new ClaimManager(
            address(protocolRoles), address(portfolioRegistry), address(assessor), address(claimReceipt)
        );

        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), address(distributor));
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), address(vaultAllocator));
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), allocator);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "NextBlock Invariant Vault",
                symbol: "nbUSDC-INV",
                vaultName: "Invariant",
                owner: admin,
                vaultManager: managerA,
                bufferRatioBps: 2000,
                managementFeeBps: 0, // fee accrual excluded: isolates conservation accounting
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        claimReceipt.setAuthorizedMinter(address(vault), true);
        claimReceipt.setAuthorizedMinter(address(claimManagerC), true);
        vault.setClaimManager(address(claimManagerC));
        // Phase 9.5: allocations restricted to the bound VaultAllocator contract.
        vault.setVaultAllocator(address(vaultAllocator));

        // Legacy policy for premium flow (long duration so it never expires mid-run)
        uint256 polId = policyRegistry.registerPolicy(
            "Premium Conduit", PolicyRegistry.VerificationType.OFF_CHAIN,
            1_000_000e6, 1_000e6, 3650 days, cedant, 0
        );
        policyRegistry.activatePolicy(polId);
        vm.stopPrank();

        vm.prank(managerA);
        vault.addPolicy(polId, 10_000);

        // Two approved portfolios with different coverage limits
        portfolioIds.push(_approvedPortfolio("CAT A", COVERAGE_A));
        portfolioIds.push(_approvedPortfolio("Marine B", COVERAGE_B));

        // Route both portfolios to the vault for distributor premium flow,
        // and activate them (claims require ACTIVE/PAUSED/EXPIRED status).
        vm.startPrank(admin);
        distributor.setPortfolioVault(portfolioIds[0], address(vault));
        distributor.setPortfolioVault(portfolioIds[1], address(vault));
        portfolioRegistry.activatePortfolio(portfolioIds[0]);
        portfolioRegistry.activatePortfolio(portfolioIds[1]);
        vm.stopPrank();

        // LPs
        address[] memory lps = new address[](2);
        lps[0] = makeAddr("lpAlpha");
        lps[1] = makeAddr("lpBeta");
        vm.startPrank(admin);
        for (uint256 i = 0; i < lps.length; i++) {
            compliance.setWhitelist(lps[i], true);
            compliance.setKycExpiry(lps[i], uint64(block.timestamp + 3650 days));
        }
        vm.stopPrank();

        handler = new VaultHandler(VaultHandler.HandlerConfig({
            vault: vault,
            usdc: usdc,
            policyRegistry: policyRegistry,
            portfolioRegistry: portfolioRegistry,
            distributor: distributor,
            vaultAllocator: vaultAllocator,
            claimManager: claimManagerC,
            admin: admin,
            committee: committee,
            allocator: allocator,
            cedant: cedant,
            lps: lps,
            portfolioIds: portfolioIds,
            legacyPolicyId: polId
        }));

        targetContract(address(handler));
    }

    function _approvedPortfolio(string memory name, uint256 coverage) internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(PortfolioRegistry.SubmissionParams({
            name: name,
            metadataURI: "ipfs://QmInv",
            documentHash: keccak256(bytes(name)),
            lineOfBusiness: "Mixed",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: coverage,
            cededPremium: 1_000e6,
            inceptionTime: uint64(block.timestamp),
            expiryTime: uint64(block.timestamp + 3650 days)
        }));
        vm.prank(admin);
        portfolioRegistry.startReview(pid);
        vm.prank(admin);
        portfolioRegistry.approvePortfolio(pid, 6_500);
    }

    /// @notice USDC conservation: vault balance == deposits + premiums - withdrawals.
    ///         (No claims or fees in this handler; both are zero by construction.)
    function invariant_usdcConservation() public view {
        uint256 balance = usdc.balanceOf(address(vault));
        assertEq(
            balance,
            handler.ghost_deposited() + handler.ghost_premiums()
                - handler.ghost_withdrawn() - handler.ghost_payouts(),
            "USDC conservation violated"
        );
    }

    /// @notice Solvency: standing claim reserves are always backed by vault cash.
    function invariant_claimReservesBacked() public view {
        (uint256 balance,, uint256 pendingClaims,,,,,) = vault.getVaultAccounting();
        assertLe(pendingClaims, balance, "claim reserves exceed vault cash");
    }

    /// @notice The claim manager never custodies funds (vault pays directly).
    function invariant_claimManagerHoldsNoFunds() public view {
        assertEq(usdc.balanceOf(address(claimManagerC)), 0, "claim manager must hold no USDC");
    }

    /// @notice UPR can never exceed total premiums received.
    function invariant_uprBoundedByPremiums() public view {
        (, uint256 upr,,,,,,) = vault.getVaultAccounting();
        assertLe(upr, handler.ghost_premiums(), "UPR exceeds received premiums");
    }

    /// @notice Per-portfolio allocation never exceeds its ceded coverage limit,
    ///         and the sum matches totalPortfolioAllocated (no double counting).
    function invariant_allocationBounds() public view {
        uint256 sum;
        for (uint256 i = 0; i < portfolioIds.length; i++) {
            uint256 pid = portfolioIds[i];
            uint256 alloc = vault.portfolioAllocation(pid);
            PortfolioRegistry.Portfolio memory pf = portfolioRegistry.getPortfolio(pid);
            assertLe(alloc, pf.coverageLimit, "allocation exceeds coverage");
            sum += alloc;
        }
        assertEq(sum, vault.totalPortfolioAllocated(), "allocation sum mismatch");
    }

    /// @notice Liquidity lock: committed capital and liabilities are never
    ///         withdrawable. availableBuffer + reserved == balance (or buffer == 0).
    function invariant_bufferNeverOverpromises() public view {
        (
            uint256 balance,
            uint256 upr,
            uint256 pendingClaims,
            uint256 deployedCapital,
            uint256 portfolioAllocated,
            uint256 availableBuffer,
            ,
        ) = vault.getVaultAccounting();

        uint256 reserved = upr + pendingClaims + deployedCapital + portfolioAllocated;
        if (balance > reserved) {
            assertEq(availableBuffer, balance - reserved, "buffer accounting mismatch");
        } else {
            assertEq(availableBuffer, 0, "buffer must floor at zero");
        }
    }

    /// @notice Distributor conservation: it holds exactly the accrued fees;
    ///         LP quotas are always forwarded atomically to the vault.
    function invariant_distributorHoldsOnlyFees() public view {
        assertEq(
            usdc.balanceOf(address(distributor)),
            distributor.accruedProtocolFees() + distributor.accruedUnderwritingFees(),
            "distributor balance != accrued fees"
        );
    }

    /// @notice The strategy layer never custodies funds.
    function invariant_allocatorHoldsNoFunds() public view {
        assertEq(usdc.balanceOf(address(vaultAllocator)), 0, "allocator must hold no USDC");
    }

    /// @notice totalAssets() must never revert and never exceed vault USDC balance.
    function invariant_totalAssetsSafe() public view {
        uint256 ta = vault.totalAssets();
        assertLe(ta, usdc.balanceOf(address(vault)), "totalAssets exceeds balance");
    }
}
