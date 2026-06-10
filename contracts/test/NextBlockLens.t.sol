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
import {NavOracle} from "../src/NavOracle.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {AdapterRegistry} from "../src/AdapterRegistry.sol";
import {NextBlockLens} from "../src/NextBlockLens.sol";

/// @title NextBlockLensTest
/// @notice Phase 10 suite: read-model correctness, vault-accounting coherence,
///         never-reverting dashboards, gradual-rollout (missing modules) and
///         explicit data-source labelling.
contract NextBlockLensTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;
    PremiumDistributor public distributor;
    NavOracle public navOracle;
    VaultAllocator public allocator;
    AIAssessor public assessor;
    ClaimManager public claimManager;
    BordereauOracle public bordereau;
    AdapterRegistry public adapterRegistry;
    NextBlockLens public lens;

    /// @dev Lens configured with NO modules: simulates day-0 Base Sepolia rollout.
    NextBlockLens public emptyLens;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public allocatorBot = makeAddr("allocatorBot");
    address public cedant = makeAddr("cedant");
    address public committee = makeAddr("claimsCommittee");
    address public sentinel = makeAddr("sentinel");
    address public oracleNode = makeAddr("brainoNode");
    address public lp = makeAddr("institutionalLP");
    address public outsider = makeAddr("outsider");

    uint256 public pid;

    uint256 constant DEPOSIT_500K = 500_000e6;
    uint256 constant COVERAGE_1M = 1_000_000e6;
    uint256 constant PREMIUM_100K = 100_000e6;
    uint256 constant CLAIM_50K = 50_000e6;
    bytes32 constant SOURCE = keccak256("braino-report");
    bytes32 constant ENSURO_ID = keccak256("ENSURO_V3");

    function setUp() public {
        vm.startPrank(admin);

        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        navOracle = new NavOracle(address(protocolRoles), address(portfolioRegistry));
        assessor = new AIAssessor(address(protocolRoles));
        distributor = new PremiumDistributor(address(usdc), address(protocolRoles), address(portfolioRegistry));
        allocator = new VaultAllocator(address(protocolRoles), address(portfolioRegistry), address(navOracle));
        claimManager = new ClaimManager(
            address(protocolRoles), address(portfolioRegistry), address(assessor), address(claimReceipt)
        );
        bordereau = new BordereauOracle(address(protocolRoles), address(portfolioRegistry));
        adapterRegistry = new AdapterRegistry(address(protocolRoles));

        // Roles
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), allocatorBot);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), address(allocator));
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.PREMIUM_DEPOSITOR_ROLE(), address(distributor));

        // LP onboarding
        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 365 days));
        compliance.setJurisdiction(lp, 44);

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
                managementFeeBps: 0,
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );
        vault.setClaimManager(address(claimManager));
        vault.setVaultAllocator(address(allocator));
        claimReceipt.setAuthorizedMinter(address(claimManager), true);

        // Lens: full address book + empty (day-0) book
        lens = new NextBlockLens(address(protocolRoles), _allModules());
        emptyLens = new NextBlockLens(address(protocolRoles), _noModules());

        usdc.mint(lp, DEPOSIT_500K);
        usdc.mint(cedant, PREMIUM_100K);
        vm.stopPrank();

        // ACTIVE portfolio owned by cedant
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "EU Property CAT QS 2026",
                metadataURI: "ipfs://QmDocs",
                documentHash: keccak256("docs"),
                lineOfBusiness: "Property CAT",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE_1M,
                cededPremium: PREMIUM_100K,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500); // expectedLossBps mock
        portfolioRegistry.activatePortfolio(pid);
        distributor.setPortfolioVault(pid, address(vault));
        vm.stopPrank();

        // LP funds the vault
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT_500K);
        vault.deposit(DEPOSIT_500K, lp);
        vm.stopPrank();
    }

    // --- Helpers ---

    function _allModules() internal view returns (NextBlockLens.ModuleAddresses memory) {
        return NextBlockLens.ModuleAddresses({
            portfolioRegistry: address(portfolioRegistry),
            complianceRegistry: address(compliance),
            vaultFactory: address(0), // factory intentionally absent (direct vault)
            premiumDistributor: address(distributor),
            navOracle: address(navOracle),
            vaultAllocator: address(allocator),
            claimManager: address(claimManager),
            aiAssessor: address(assessor),
            bordereauOracle: address(bordereau),
            adapterRegistry: address(adapterRegistry)
        });
    }

    function _noModules() internal pure returns (NextBlockLens.ModuleAddresses memory m) {
        return m; // all zero
    }

    function _payPremium(uint256 amount) internal {
        vm.startPrank(cedant);
        usdc.approve(address(distributor), amount);
        distributor.receivePremium(pid, amount);
        vm.stopPrank();
    }

    function _allocate(uint256 amount) internal {
        vm.startPrank(allocatorBot);
        uint256 propId = allocator.proposeAllocation(address(vault), pid, amount);
        allocator.executeAllocation(propId);
        vm.stopPrank();
    }

    function _paidClaim(uint256 amount) internal returns (uint256 claimId) {
        vm.prank(cedant);
        claimId = claimManager.submitClaim(
            address(vault), pid, amount, ClaimManager.ClaimType.NON_PARAMETRIC, keccak256("evidence")
        );
        vm.prank(oracleNode);
        assessor.publishAssessment(claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, amount, SOURCE);
        claimManager.attachAssessment(claimId);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        claimManager.approveClaim(claimId, amount);
        claimManager.executeClaim(claimId);
    }

    // =========== 1. PROTOCOL STATUS ===========

    function test_protocolStatus_full() public {
        NextBlockLens.ProtocolStatusView memory v = lens.getProtocolStatus();
        assertEq(v.schemaVersion, lens.SCHEMA_VERSION());
        assertEq(v.lensVersion, lens.LENS_VERSION());
        assertEq(v.chainId, block.chainid);
        assertEq(v.modules.claimManager, address(claimManager));
        assertEq(v.portfolioCount, portfolioRegistry.getPortfolioCount());
        assertEq(v.portfolioCount, 1);
        assertEq(v.claimCount, 0);
        assertEq(v.vaultCount, 0); // factory not configured: degrades to 0, no revert
    }

    function test_protocolStatus_emptyLens_neverReverts() public {
        NextBlockLens.ProtocolStatusView memory v = emptyLens.getProtocolStatus();
        assertEq(v.portfolioCount, 0);
        assertEq(v.claimCount, 0);
        assertEq(v.adapterCount, 0);
        assertEq(v.modules.portfolioRegistry, address(0));
    }

    // =========== 2. VAULT DASHBOARD (coherence with vault accounting) ===========

    function test_vaultDashboard_coherence_afterFullFlow() public {
        _payPremium(PREMIUM_100K);
        _allocate(100_000e6);
        _paidClaim(CLAIM_50K);

        NextBlockLens.VaultDashboardView memory v = lens.getVaultDashboard(address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));

        // COHERENCE REQUIREMENT: the lens must NEVER contradict the vault.
        (
            uint256 balance,
            uint256 upr,
            uint256 pendingClaims,
            uint256 deployed,
            uint256 portfolioAllocated,
            uint256 buffer,
            uint256 capacity,
            uint256 cap
        ) = vault.getVaultAccounting();
        assertEq(v.balance, balance);
        assertEq(v.unearnedPremiums, upr);
        assertEq(v.pendingClaims, pendingClaims);
        assertEq(v.deployedCapital, deployed);
        assertEq(v.portfolioAllocated, portfolioAllocated);
        assertEq(v.availableBuffer, buffer);
        assertEq(v.underwritingCapacity, capacity);
        assertEq(v.depositCap, cap);
        assertEq(v.totalAssets, vault.totalAssets());
        assertEq(v.totalShares, vault.totalSupply());
        assertEq(v.sharePrice, vault.convertToAssets(1e18));
        assertEq(v.boundClaimManager, address(claimManager));
        assertEq(v.boundVaultAllocator, address(allocator));
        assertEq(v.bufferRatioBps, 2000);

        // Sanity on the flow itself: the 50K payout reduced the allocated
        // exposure (vault accounting), and the reserve was released.
        assertEq(v.portfolioAllocated, 100_000e6 - CLAIM_50K);
        assertEq(v.pendingClaims, 0);
    }

    function test_vaultDashboard_unavailable_neverReverts() public {
        // address(0), EOA and wrong contract: all degrade, none reverts
        NextBlockLens.VaultDashboardView memory a = lens.getVaultDashboard(address(0));
        assertEq(uint8(a.status), uint8(NextBlockLens.DataStatus.UNAVAILABLE));

        NextBlockLens.VaultDashboardView memory b = lens.getVaultDashboard(outsider);
        assertEq(uint8(b.status), uint8(NextBlockLens.DataStatus.UNAVAILABLE));

        NextBlockLens.VaultDashboardView memory c = lens.getVaultDashboard(address(usdc));
        assertEq(uint8(c.status), uint8(NextBlockLens.DataStatus.UNAVAILABLE));
    }

    function test_rawVaultDashboard_reverts_forAuditors() public {
        vm.expectRevert();
        lens.rawVaultDashboard(address(usdc)); // strict twin keeps the error
    }

    // =========== 3. LP STATUS ===========

    function test_lpStatus_compliantLP() public {
        NextBlockLens.LPStatusView memory v = lens.getLPStatus(address(vault), lp);
        assertEq(uint8(v.complianceStatus), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(uint8(v.vaultStatus), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertTrue(v.whitelisted);
        assertFalse(v.blocked);
        assertFalse(v.kycExpired);
        assertEq(v.jurisdictionCode, 44);
        assertTrue(v.canReceive);
        assertEq(v.shareBalance, vault.balanceOf(lp));
        assertEq(v.assetValue, vault.convertToAssets(vault.balanceOf(lp)));
        assertEq(v.maxWithdraw, vault.maxWithdraw(lp));
        assertEq(v.maxRedeem, vault.maxRedeem(lp));
        assertTrue(v.redemptionEligible);
    }

    function test_lpStatus_kycExpiry_andBlocked() public {
        // KYC expiry flips the flag (display) and canReceive (registry truth)
        vm.warp(block.timestamp + 366 days);
        NextBlockLens.LPStatusView memory v = lens.getLPStatus(address(vault), lp);
        assertTrue(v.kycExpired);
        assertFalse(v.canReceive);

        // Sentinel block reflected from the registry, never simulated
        vm.prank(sentinel);
        compliance.setBlocked(outsider, true);
        NextBlockLens.LPStatusView memory o = lens.getLPStatus(address(vault), outsider);
        assertTrue(o.blocked);
        assertFalse(o.canReceive);
        assertEq(o.shareBalance, 0);
        assertFalse(o.redemptionEligible);
    }

    function test_lpStatus_partialModules() public {
        // Compliance missing, vault present: statuses are independent
        NextBlockLens.LPStatusView memory v = emptyLens.getLPStatus(address(vault), lp);
        assertEq(uint8(v.complianceStatus), uint8(NextBlockLens.DataStatus.UNAVAILABLE));
        assertEq(uint8(v.vaultStatus), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(v.shareBalance, vault.balanceOf(lp));

        // Vault missing too
        NextBlockLens.LPStatusView memory w = emptyLens.getLPStatus(address(0), lp);
        assertEq(uint8(w.vaultStatus), uint8(NextBlockLens.DataStatus.UNAVAILABLE));
    }

    // =========== 4. PORTFOLIO STATUS ===========

    function test_portfolioStatus_lifecycle_andRisk() public {
        _allocate(75_000e6);
        _payPremium(PREMIUM_100K);

        NextBlockLens.PortfolioStatusView memory v = lens.getPortfolioStatus(pid, address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(v.portfolio.cedant, cedant);
        assertEq(uint8(v.portfolio.status), uint8(PortfolioRegistry.PortfolioStatus.ACTIVE));
        assertEq(v.portfolio.coverageLimit, COVERAGE_1M);
        assertEq(v.portfolio.expectedLossBps, 6_500); // declared mock
        assertTrue(v.allocatable);
        assertEq(v.allocatedExposure, vault.portfolioAllocation(pid));
        assertEq(v.premiumRecorded, vault.portfolioPremium(pid));

        // Risk: NONE before publish, labelled MOCK_ORACLE
        assertEq(uint8(v.riskStatus), uint8(NextBlockLens.DataStatus.NONE));
        assertEq(uint8(v.riskSource), uint8(NextBlockLens.DataSource.MOCK_ORACLE));

        vm.prank(oracleNode);
        navOracle.publishPortfolioRisk(pid, 6_200, 9_000, SOURCE);
        v = lens.getPortfolioStatus(pid, address(vault));
        assertEq(uint8(v.riskStatus), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(v.riskScoreBps, 6_200);
        assertEq(v.riskSourceHash, SOURCE);

        // STALE after the freshness guard elapses
        vm.warp(block.timestamp + navOracle.maxStaleness() + 1);
        v = lens.getPortfolioStatus(pid, address(vault));
        assertEq(uint8(v.riskStatus), uint8(NextBlockLens.DataStatus.STALE));
        assertEq(v.riskScoreBps, 6_200); // data still surfaced, status says stale
    }

    function test_portfolioStatus_unknownId_isNone() public {
        NextBlockLens.PortfolioStatusView memory v = lens.getPortfolioStatus(999, address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.NONE));
    }

    // =========== 5. PREMIUM DASHBOARD ===========

    function test_premiumDashboard_splitAndConservation() public {
        NextBlockLens.PremiumDashboardView memory before_ = lens.getPremiumDashboard(pid);
        assertEq(uint8(before_.status), uint8(NextBlockLens.DataStatus.NONE)); // no premium yet
        assertEq(before_.vault, address(vault)); // routing already visible

        _payPremium(PREMIUM_100K);

        NextBlockLens.PremiumDashboardView memory v = lens.getPremiumDashboard(pid);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));

        PremiumDistributor.PremiumAccounting memory acc = distributor.getPremiumAccounting(pid);
        assertEq(v.gross, acc.gross);
        assertEq(v.lpQuota, acc.lpQuota);
        assertEq(v.protocolFees, acc.protocolFees);
        assertEq(v.underwritingFees, acc.underwritingFees);
        // Conservation surfaced by the lens must match the distributor exactly
        assertEq(v.gross, v.lpQuota + v.protocolFees + v.underwritingFees);
        assertEq(v.totalGrossReceived, PREMIUM_100K);
        assertEq(v.protocolFeeBps, distributor.protocolFeeBps());
    }

    // =========== 6. CLAIM DASHBOARD ===========

    function test_claimDashboard_lifecycle() public {
        _allocate(100_000e6);

        vm.prank(cedant);
        uint256 claimId = claimManager.submitClaim(
            address(vault), pid, CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC, keccak256("evidence")
        );

        NextBlockLens.ClaimDashboardView memory v = lens.getClaimDashboard(claimId);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(uint8(v.claim.status), uint8(ClaimManager.ClaimStatus.SUBMITTED));
        assertFalse(v.hasAssessment);
        assertEq(uint8(v.assessmentSource), uint8(NextBlockLens.DataSource.NOT_AVAILABLE));
        assertFalse(v.disputeWindowElapsed);

        // Advisory AI attached: labelled MOCK_ORACLE, never an approval
        vm.prank(oracleNode);
        assessor.publishAssessment(claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, CLAIM_50K, SOURCE);
        claimManager.attachAssessment(claimId);
        v = lens.getClaimDashboard(claimId);
        assertTrue(v.hasAssessment);
        assertEq(uint8(v.assessmentSource), uint8(NextBlockLens.DataSource.MOCK_ORACLE));
        assertEq(v.assessment.recommendedAmount, CLAIM_50K);
        assertFalse(v.anomalous);
        assertEq(uint8(v.claim.status), uint8(ClaimManager.ClaimStatus.ASSESSED)); // still NOT approved

        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        claimManager.approveClaim(claimId, CLAIM_50K);
        v = lens.getClaimDashboard(claimId);
        assertEq(uint8(v.claim.status), uint8(ClaimManager.ClaimStatus.APPROVED));
        assertTrue(v.disputeWindowElapsed);

        claimManager.executeClaim(claimId);
        v = lens.getClaimDashboard(claimId);
        assertEq(uint8(v.claim.status), uint8(ClaimManager.ClaimStatus.PAID));
    }

    function test_claimDashboard_unknownClaim_isNone() public {
        NextBlockLens.ClaimDashboardView memory v = lens.getClaimDashboard(999);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.NONE));
    }

    // =========== 7. ORACLE DASHBOARD ===========

    function test_oracleDashboard_statusPrecedence() public {
        // NONE before any publish
        NextBlockLens.OracleDashboardView memory v = lens.getOracleDashboard(address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.NONE));
        assertEq(uint8(v.source), uint8(NextBlockLens.DataSource.MOCK_ORACLE));

        // AVAILABLE after publish
        vm.prank(oracleNode);
        navOracle.publishNav(address(vault), 500_000e6, 9_000, SOURCE);
        v = lens.getOracleDashboard(address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(v.nav, 500_000e6);
        assertEq(v.sourceHash, SOURCE);
        assertEq(v.maxStaleness, navOracle.maxStaleness());

        // STALE after the guard elapses
        vm.warp(block.timestamp + navOracle.maxStaleness() + 1);
        v = lens.getOracleDashboard(address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.STALE));

        // PAUSED wins over everything else
        vm.prank(sentinel);
        navOracle.pauseFeed(address(vault));
        v = lens.getOracleDashboard(address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.PAUSED));
        assertTrue(v.feedPaused);
    }

    function test_oracleDashboard_missingModule() public {
        NextBlockLens.OracleDashboardView memory v = emptyLens.getOracleDashboard(address(vault));
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.UNAVAILABLE));
        assertEq(uint8(v.source), uint8(NextBlockLens.DataSource.NOT_AVAILABLE));
    }

    // =========== 8. BORDEREAU DASHBOARD ===========

    function test_bordereauDashboard_noneThenFinalized() public {
        NextBlockLens.BordereauDashboardView memory v =
            lens.getBordereauDashboard(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.NONE)); // unverified == absent
        assertEq(v.liveness, bordereau.liveness());

        vm.prank(cedant);
        uint256 aid = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, keccak256("bordereau"), "ipfs://b", PREMIUM_100K
        );
        // Still NONE during liveness: PROPOSED data is not surfaced as verified
        v = lens.getBordereauDashboard(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.NONE));

        vm.warp(block.timestamp + bordereau.liveness() + 1);
        bordereau.finalizeAssertion(aid);
        v = lens.getBordereauDashboard(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertEq(v.latestFinalized.declaredAmount, PREMIUM_100K);
        assertEq(v.latestFinalized.dataHash, keccak256("bordereau"));
        assertEq(v.assertionCount, 1);
    }

    // =========== 9. ADAPTER DASHBOARD ===========

    function test_adapterDashboard_lifecycle() public {
        NextBlockLens.AdapterDashboardView memory v = lens.getAdapterDashboard(ENSURO_ID);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.NONE));

        vm.prank(admin);
        adapterRegistry.registerAdapter(ENSURO_ID, makeAddr("ensuro"), "Ensuro", keccak256("dd"), 1_000_000e6);
        v = lens.getAdapterDashboard(ENSURO_ID);
        assertEq(uint8(v.status), uint8(NextBlockLens.DataStatus.AVAILABLE));
        assertFalse(v.active); // PENDING

        vm.prank(admin);
        adapterRegistry.activateAdapter(ENSURO_ID);
        v = lens.getAdapterDashboard(ENSURO_ID);
        assertTrue(v.active);
        assertEq(v.adapter.exposureCap, 1_000_000e6);
    }

    // =========== CONFIGURATION & GOVERNANCE ===========

    function test_setModules_onlyOwner() public {
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        NextBlockLens.ModuleAddresses memory m = _allModules();

        vm.prank(outsider);
        vm.expectRevert(
            abi.encodeWithSelector(NextBlockLens.NextBlockLens__UnauthorizedRole.selector, outsider, ownerRole)
        );
        emptyLens.setModules(m);

        // Gradual rollout: OWNER adds modules as they land on Base Sepolia
        vm.prank(admin);
        emptyLens.setModules(m);
        NextBlockLens.ProtocolStatusView memory v = emptyLens.getProtocolStatus();
        assertEq(v.modules.claimManager, address(claimManager));
        assertEq(v.portfolioCount, 1);
    }

    function test_constructor_zeroRoles_reverts() public {
        vm.expectRevert(NextBlockLens.NextBlockLens__InvalidParams.selector);
        new NextBlockLens(address(0), _noModules());
    }

    // =========== NEVER-REVERT SWEEP (garbage inputs) ===========

    function test_lens_neverReverts_onGarbageInputs() public view {
        lens.getProtocolStatus();
        lens.getVaultDashboard(address(0xdead));
        lens.getLPStatus(address(0xdead), address(0xbeef));
        lens.getPortfolioStatus(type(uint256).max, address(0xdead));
        lens.getPremiumDashboard(type(uint256).max);
        lens.getClaimDashboard(type(uint256).max);
        lens.getOracleDashboard(address(0xdead));
        lens.getBordereauDashboard(type(uint256).max, BordereauOracle.AssertionType.OTHER);
        lens.getAdapterDashboard(bytes32(uint256(1)));

        emptyLens.getProtocolStatus();
        emptyLens.getVaultDashboard(address(0));
        emptyLens.getLPStatus(address(0), address(0));
        emptyLens.getPortfolioStatus(0, address(0));
        emptyLens.getPremiumDashboard(0);
        emptyLens.getClaimDashboard(0);
        emptyLens.getOracleDashboard(address(0));
        emptyLens.getBordereauDashboard(0, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        emptyLens.getAdapterDashboard(bytes32(0));
    }

    /// @notice Read-only guarantee: the lens holds no funds and exposes no
    ///         value-receiving surface.
    function test_lens_isNonCustodial() public {
        assertEq(usdc.balanceOf(address(lens)), 0);
        (bool ok,) = address(lens).call{value: 1 ether}("");
        assertFalse(ok); // no receive/fallback
    }
}
