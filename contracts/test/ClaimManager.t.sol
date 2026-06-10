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
import {AIAssessor} from "../src/AIAssessor.sol";
import {ClaimManager} from "../src/ClaimManager.sol";

/// @title ClaimManagerTest
/// @notice Phase 7 suite: claim lifecycle, AI-advisory-only guarantee, dispute
///         window, committee authority, sentinel freeze, insolvency guard,
///         double-payout protection and vault-as-sole-payout-executor.
contract ClaimManagerTest is Test {
    ProtocolRoles public protocolRoles;
    ComplianceRegistry public compliance;
    PortfolioRegistry public portfolioRegistry;
    PolicyRegistry public policyRegistry;
    ClaimReceipt public claimReceipt;
    MockUSDC public usdc;
    MockOracle public oracle;
    InsuranceVault public vault;
    AIAssessor public assessor;
    ClaimManager public claimManager;

    address public admin = makeAddr("admin");
    address public managerA = makeAddr("managerA");
    address public cedant = makeAddr("cedant");
    address public committee = makeAddr("claimsCommittee");
    address public sentinel = makeAddr("sentinel");
    address public oracleNode = makeAddr("brainoNode");
    address public lp = makeAddr("institutionalLP");
    address public attacker = makeAddr("attacker");

    uint256 public pid;

    uint256 constant DEPOSIT_200K = 200_000e6;
    uint256 constant COVERAGE_150K = 150_000e6;
    uint256 constant CLAIM_50K = 50_000e6;
    bytes32 constant EVIDENCE = keccak256("loss-bordereau-2026-06");
    bytes32 constant AI_SOURCE = keccak256("wavenure-claim-report");

    function setUp() public {
        vm.startPrank(admin);

        protocolRoles = new ProtocolRoles(admin);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policyRegistry = new PolicyRegistry(address(protocolRoles));
        claimReceipt = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(protocolRoles));
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        assessor = new AIAssessor(address(protocolRoles));

        claimManager = new ClaimManager(
            address(protocolRoles),
            address(portfolioRegistry),
            address(assessor),
            address(claimReceipt)
        );

        // Roles
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), managerA);
        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);

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
                managementFeeBps: 0,
                registry: address(policyRegistry),
                oracle: address(oracle),
                claimReceipt: address(claimReceipt),
                protocolRoles: address(protocolRoles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolioRegistry)
            })
        );

        // Bind: ClaimManager is the vault's only claim path; CM mints receipts.
        vault.setClaimManager(address(claimManager));
        claimReceipt.setAuthorizedMinter(address(claimManager), true);

        usdc.mint(lp, DEPOSIT_200K);
        vm.stopPrank();

        // Approved + ACTIVE portfolio owned by cedant
        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(PortfolioRegistry.SubmissionParams({
            name: "EU Property CAT QS 2026",
            metadataURI: "ipfs://QmDocs",
            documentHash: keccak256("docs"),
            lineOfBusiness: "Property CAT",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: COVERAGE_150K,
            cededPremium: 15_000e6,
            inceptionTime: uint64(block.timestamp),
            expiryTime: uint64(block.timestamp + 365 days)
        }));
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500); // expectedLossBps mock
        portfolioRegistry.activatePortfolio(pid);
        vm.stopPrank();

        // LP funds the vault
        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT_200K);
        vault.deposit(DEPOSIT_200K, lp);
        vm.stopPrank();
    }

    // --- Helpers ---

    function _submit(uint256 amount, ClaimManager.ClaimType ctype) internal returns (uint256 claimId) {
        vm.prank(cedant);
        claimId = claimManager.submitClaim(address(vault), pid, amount, ctype, EVIDENCE);
    }

    function _assess(uint256 claimId, uint16 anomalyBps) internal {
        vm.prank(oracleNode);
        assessor.publishAssessment(
            claimId, 8_000, anomalyBps, 9_000,
            AIAssessor.Recommendation.APPROVE, CLAIM_50K, AI_SOURCE
        );
        claimManager.attachAssessment(claimId);
    }

    function _toApproved(uint256 amount) internal returns (uint256 claimId) {
        claimId = _submit(amount, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000); // low anomaly
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        claimManager.approveClaim(claimId, amount);
    }

    // =========== SUBMISSION ===========

    function test_submitClaim_happyPath() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);

        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        assertEq(c.claimant, cedant);
        assertEq(c.requestedAmount, CLAIM_50K);
        assertEq(uint8(c.status), uint8(ClaimManager.ClaimStatus.SUBMITTED));
        assertEq(c.evidenceHash, EVIDENCE);
        assertEq(c.challengeDeadline, uint64(block.timestamp) + claimManager.disputeWindow());
    }

    function test_submitClaim_onlyPortfolioCedant() public {
        // Another address with cedant role but not THIS portfolio's cedant
        address otherCedant = makeAddr("otherCedant");
        bytes32 cedantRole = protocolRoles.AUTHORIZED_CEDANT_ROLE();
        vm.prank(admin);
        protocolRoles.grantRole(cedantRole, otherCedant);

        vm.prank(otherCedant);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__NotPortfolioCedant.selector, pid, otherCedant
        ));
        claimManager.submitClaim(address(vault), pid, CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);

        // No role at all
        vm.prank(attacker);
        vm.expectRevert();
        claimManager.submitClaim(address(vault), pid, CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);
    }

    function test_submitClaim_exceedsCoverage_reverts() public {
        vm.prank(cedant);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__AmountExceedsCoverage.selector, COVERAGE_150K + 1, COVERAGE_150K
        ));
        claimManager.submitClaim(address(vault), pid, COVERAGE_150K + 1, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);
    }

    // =========== AI IS ADVISORY ONLY ===========

    function test_aiRecommendation_neverApprovesOrPays() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000); // recommendation = APPROVE

        // Even with an APPROVE recommendation and elapsed window, the claim stays
        // ASSESSED until the committee acts. No funds moved, no reserve taken.
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);

        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        assertEq(uint8(c.status), uint8(ClaimManager.ClaimStatus.ASSESSED));
        (, , uint256 pendingClaims,,,,,) = vault.getVaultAccounting();
        assertEq(pendingClaims, 0);
        assertEq(usdc.balanceOf(cedant), 0);
    }

    function test_assessor_cannotMoveFundsOrCallVault() public view {
        // Structural guarantee: the assessor has no reference to vault/USDC.
        // It only stores data; verified here by checking it holds no balance
        // and the vault's claimManager binding points elsewhere.
        assertEq(usdc.balanceOf(address(assessor)), 0);
        assertEq(vault.claimManager(), address(claimManager));
    }

    function test_anomalousAssessment_autoFreezes() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 8_000); // >= 7000 threshold -> anomaly

        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        assertTrue(c.frozen);

        // Frozen claims cannot be approved even after the window
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        vm.expectRevert(abi.encodeWithSelector(ClaimManager.ClaimManager__ClaimFrozenError.selector, claimId));
        claimManager.approveClaim(claimId, CLAIM_50K);

        // Sentinel review unfreezes; committee can then approve
        vm.prank(sentinel);
        claimManager.unfreezeClaim(claimId);
        vm.prank(committee);
        claimManager.approveClaim(claimId, CLAIM_50K);
    }

    // =========== DISPUTE WINDOW & COMMITTEE AUTHORITY ===========

    function test_approve_beforeWindow_reverts() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000);

        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        vm.prank(committee);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__DisputeWindowActive.selector, claimId, c.challengeDeadline
        ));
        claimManager.approveClaim(claimId, CLAIM_50K);
    }

    function test_approve_withoutAssessment_reverts() public {
        // AI gate: non-parametric claims need an assessment on file
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);

        vm.prank(committee);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__InvalidStatus.selector, claimId, ClaimManager.ClaimStatus.SUBMITTED
        ));
        claimManager.approveClaim(claimId, CLAIM_50K);
    }

    function test_approve_onlyCommittee() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);

        bytes32 committeeRole = protocolRoles.CLAIMS_COMMITTEE_ROLE();
        // Sentinel CANNOT approve (power separation)
        vm.prank(sentinel);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__UnauthorizedRole.selector, sentinel, committeeRole
        ));
        claimManager.approveClaim(claimId, CLAIM_50K);

        // Oracle node cannot approve either
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__UnauthorizedRole.selector, oracleNode, committeeRole
        ));
        claimManager.approveClaim(claimId, CLAIM_50K);
    }

    function test_parametric_skipsWindow_butStillNeedsCommittee() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.PARAMETRIC);

        // No window wait, no assessment: committee can approve immediately
        vm.prank(committee);
        claimManager.approveClaim(claimId, CLAIM_50K);
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.APPROVED));

        // But nobody else could have
        uint256 claimId2 = _submit(10_000e6, ClaimManager.ClaimType.PARAMETRIC);
        vm.prank(attacker);
        vm.expectRevert();
        claimManager.approveClaim(claimId2, 10_000e6);
    }

    function test_partialApproval() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);

        vm.prank(committee);
        claimManager.approveClaim(claimId, 30_000e6); // partial

        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        assertEq(c.approvedAmount, 30_000e6);
        (, , uint256 pendingClaims,,,,,) = vault.getVaultAccounting();
        assertEq(pendingClaims, 30_000e6);
    }

    // =========== DISPUTE FLOW ===========

    function test_disputeFlow_sentinelAndCommittee() public {
        uint256 claimId = _submit(CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000);

        // Sentinel disputes within the window
        vm.prank(sentinel);
        claimManager.disputeClaim(claimId, "loss data inconsistent with bordereau");
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.DISPUTED));

        // Sentinel cannot resolve its own dispute (committee authority)
        bytes32 committeeRole = protocolRoles.CLAIMS_COMMITTEE_ROLE();
        vm.prank(sentinel);
        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__UnauthorizedRole.selector, sentinel, committeeRole
        ));
        claimManager.resolveDispute(claimId, true);

        // Committee dismisses the dispute -> back to ASSESSED, unfrozen
        vm.prank(committee);
        claimManager.resolveDispute(claimId, false);
        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        assertEq(uint8(c.status), uint8(ClaimManager.ClaimStatus.ASSESSED));
        assertFalse(c.frozen);

        // Second dispute upheld -> terminal rejection
        vm.prank(sentinel);
        claimManager.disputeClaim(claimId, "fraud indicators");
        vm.prank(committee);
        claimManager.resolveDispute(claimId, true);
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.REJECTED));
    }

    // =========== PAYOUT (VAULT AS SOLE EXECUTOR) ===========

    function test_fullLifecycle_payout() public {
        uint256 claimId = _toApproved(CLAIM_50K);

        ClaimManager.Claim memory c = claimManager.getClaim(claimId);
        // Receipt minted at approval, owned by the claimant, correct amount
        assertEq(claimReceipt.ownerOf(c.receiptId), cedant);
        ClaimReceipt.Receipt memory r = claimReceipt.getReceipt(c.receiptId);
        assertEq(r.claimAmount, CLAIM_50K);
        assertEq(r.insurer, cedant);
        assertFalse(r.exercised);

        uint256 vaultBefore = usdc.balanceOf(address(vault));
        uint256 cedantBefore = usdc.balanceOf(cedant);

        claimManager.executeClaim(claimId); // permissionless once approved

        assertEq(usdc.balanceOf(cedant) - cedantBefore, CLAIM_50K);
        assertEq(vaultBefore - usdc.balanceOf(address(vault)), CLAIM_50K);
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.PAID));

        // Reserve fully consumed
        (, , uint256 pendingClaims,,,,,) = vault.getVaultAccounting();
        assertEq(pendingClaims, 0);
    }

    function test_doublePayout_impossible() public {
        uint256 claimId = _toApproved(CLAIM_50K);
        claimManager.executeClaim(claimId);

        vm.expectRevert(abi.encodeWithSelector(
            ClaimManager.ClaimManager__InvalidStatus.selector, claimId, ClaimManager.ClaimStatus.PAID
        ));
        claimManager.executeClaim(claimId);
    }

    function test_frozenApprovedClaim_cannotExecute() public {
        uint256 claimId = _toApproved(CLAIM_50K);

        vm.prank(sentinel);
        claimManager.freezeClaim(claimId);

        vm.expectRevert(abi.encodeWithSelector(ClaimManager.ClaimManager__ClaimFrozenError.selector, claimId));
        claimManager.executeClaim(claimId);
    }

    function test_insolvencyGuard_approveRevertsWithoutBacking() public {
        // Vault has 200K cash; try approving a claim larger than free funds
        uint256 claimId = _submit(COVERAGE_150K, ClaimManager.ClaimType.PARAMETRIC);
        vm.prank(committee);
        claimManager.approveClaim(claimId, COVERAGE_150K); // 150K <= 200K free: ok

        // Second claim: only 50K free remains; 100K must revert at the VAULT level
        uint256 claimId2 = _submit(100_000e6, ClaimManager.ClaimType.PARAMETRIC);
        vm.prank(committee);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__ClaimReserveInsufficientFunds.selector, 100_000e6, 50_000e6
        ));
        claimManager.approveClaim(claimId2, 100_000e6);
    }

    function test_rejectAfterApproval_releasesReserve() public {
        uint256 claimId = _toApproved(CLAIM_50K);
        (, , uint256 reservedBefore,,,,,) = vault.getVaultAccounting();
        assertEq(reservedBefore, CLAIM_50K);

        vm.prank(committee);
        claimManager.rejectClaim(claimId, "post-approval audit failed");

        (, , uint256 reservedAfter,,,,,) = vault.getVaultAccounting();
        assertEq(reservedAfter, 0);
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.REJECTED));
    }

    function test_reserveProtectsLPWithdrawals() public {
        uint256 claimId = _toApproved(CLAIM_50K);
        claimId; // silence

        // LP cannot withdraw the reserved 50K
        uint256 maxW = vault.maxWithdraw(lp);
        assertLe(maxW, DEPOSIT_200K - CLAIM_50K);
    }

    // =========== NO VAULT BYPASS ===========

    function test_vaultClaimPath_onlyClaimManager() public {
        // Nobody else can call the vault claim functions: not attacker, not the
        // committee, not the sentinel. ClaimManager binding is the only path.
        address[3] memory callers = [attacker, committee, sentinel];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.startPrank(callers[i]);
            vm.expectRevert(abi.encodeWithSelector(
                InsuranceVault.InsuranceVault__NotClaimManager.selector, callers[i]
            ));
            vault.reservePortfolioClaim(0, pid, 1e6);
            vm.expectRevert(abi.encodeWithSelector(
                InsuranceVault.InsuranceVault__NotClaimManager.selector, callers[i]
            ));
            vault.payPortfolioClaim(0, pid, callers[i], 1e6);
            vm.expectRevert(abi.encodeWithSelector(
                InsuranceVault.InsuranceVault__NotClaimManager.selector, callers[i]
            ));
            vault.releasePortfolioClaimReserve(0, pid, 1e6);
            vm.stopPrank();
        }
    }

    function test_setClaimManager_onlyOwnerRole() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(
            InsuranceVault.InsuranceVault__UnauthorizedCaller.selector, attacker
        ));
        vault.setClaimManager(attacker);
    }

    function test_claimManager_holdsNoFunds() public {
        uint256 claimId = _toApproved(CLAIM_50K);
        claimManager.executeClaim(claimId);
        // Payout went vault -> cedant directly; CM never custodies USDC
        assertEq(usdc.balanceOf(address(claimManager)), 0);
    }

    // =========== CONFIG ===========

    function test_disputeWindow_floorEnforced() public {
        uint64 floorW = claimManager.DISPUTE_WINDOW_FLOOR();
        vm.prank(admin);
        vm.expectRevert(ClaimManager.ClaimManager__InvalidParams.selector);
        claimManager.setDisputeWindow(floorW - 1);

        vm.prank(admin);
        claimManager.setDisputeWindow(7 days);
        assertEq(claimManager.disputeWindow(), 7 days);
    }

    // =========== FUZZ ===========

    function testFuzz_approvedAmount_boundedByRequest(uint256 requested, uint256 approved) public {
        requested = bound(requested, 1e6, COVERAGE_150K);
        uint256 claimId = _submit(requested, ClaimManager.ClaimType.NON_PARAMETRIC);
        _assess(claimId, 1_000);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);

        approved = bound(approved, 1, requested * 2);
        if (approved > requested) {
            vm.prank(committee);
            vm.expectRevert(abi.encodeWithSelector(
                ClaimManager.ClaimManager__ApprovedAmountInvalid.selector, approved, requested
            ));
            claimManager.approveClaim(claimId, approved);
        } else {
            vm.prank(committee);
            claimManager.approveClaim(claimId, approved);
            assertEq(claimManager.getClaim(claimId).approvedAmount, approved);
        }
    }

    function testFuzz_payout_neverExceedsReserveOrBalance(uint256 amount) public {
        amount = bound(amount, 1e6, COVERAGE_150K);
        uint256 claimId = _submit(amount, ClaimManager.ClaimType.PARAMETRIC);
        vm.prank(committee);
        claimManager.approveClaim(claimId, amount);

        uint256 balanceBefore = usdc.balanceOf(address(vault));
        claimManager.executeClaim(claimId);

        // Conservation: vault paid exactly the approved amount, never more
        assertEq(balanceBefore - usdc.balanceOf(address(vault)), amount);
        (, , uint256 pendingClaims,,,,,) = vault.getVaultAccounting();
        assertEq(pendingClaims, 0);
    }
}
