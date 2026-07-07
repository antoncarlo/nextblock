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
import {RedemptionQueue} from "../src/RedemptionQueue.sol";
import {VaultAllocator} from "../src/VaultAllocator.sol";

/// @title BranchCoverageTest
/// @author Anton Carlo Santoro
/// @notice Targets the revert/edge branches the module suites leave uncovered
///         (coverage-floor ratchet material): constructor guards, invalid
///         lifecycle transitions, pause/bounds paths and the buffer ceiling.
///         Every case here pins a branch that protects solvency, compliance
///         or lifecycle integrity — not decorative 100%-chasing.
contract BranchCoverageTest is Test {
    ProtocolRoles internal protocolRoles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolioRegistry;
    PolicyRegistry internal policyRegistry;
    ClaimReceipt internal claimReceipt;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;
    AIAssessor internal assessor;
    ClaimManager internal claimManager;

    address internal admin = makeAddr("admin");
    address internal managerA = makeAddr("managerA");
    address internal cedant = makeAddr("cedant");
    address internal committee = makeAddr("committee");
    address internal sentinel = makeAddr("sentinel");
    address internal oracleNode = makeAddr("oracleNode");
    address internal keeper = makeAddr("keeper");
    address internal lp = makeAddr("lp");
    address internal rando = makeAddr("rando");

    uint256 internal pid;

    uint256 constant DEPOSIT_200K = 200_000e6;
    uint256 constant COVERAGE_150K = 150_000e6;
    uint256 constant CLAIM_50K = 50_000e6;
    bytes32 constant EVIDENCE = keccak256("evidence");
    bytes32 constant AI_SOURCE = keccak256("ai-source");

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
            address(protocolRoles), address(portfolioRegistry), address(assessor), address(claimReceipt)
        );

        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.ALLOCATOR_ROLE(), keeper);
        protocolRoles.grantRole(protocolRoles.KYC_OPERATOR_ROLE(), admin);

        compliance.setWhitelist(lp, true);
        compliance.setKycExpiry(lp, uint64(block.timestamp + 3650 days));

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
        claimReceipt.setAuthorizedMinter(address(claimManager), true);
        usdc.mint(lp, DEPOSIT_200K);
        vm.stopPrank();

        vm.prank(cedant);
        pid = portfolioRegistry.submitPortfolio(_submission("EU Property CAT QS 2026"));
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500);
        portfolioRegistry.activatePortfolio(pid);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT_200K);
        vault.deposit(DEPOSIT_200K, lp);
        vm.stopPrank();
    }

    function _submission(string memory name) internal view returns (PortfolioRegistry.SubmissionParams memory) {
        return PortfolioRegistry.SubmissionParams({
            name: name,
            metadataURI: "ipfs://QmDocs",
            documentHash: keccak256("docs"),
            lineOfBusiness: "Property CAT",
            jurisdiction: "EU",
            structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
            coverageLimit: COVERAGE_150K,
            cededPremium: 15_000e6,
            inceptionTime: uint64(block.timestamp),
            expiryTime: uint64(block.timestamp + 365 days)
        });
    }

    function _submit(ClaimManager.ClaimType ctype) internal returns (uint256 claimId) {
        vm.prank(cedant);
        claimId = claimManager.submitClaim(address(vault), pid, CLAIM_50K, ctype, EVIDENCE);
    }

    function _toApproved() internal returns (uint256 claimId) {
        claimId = _submit(ClaimManager.ClaimType.NON_PARAMETRIC);
        vm.prank(oracleNode);
        assessor.publishAssessment(
            claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, CLAIM_50K, AI_SOURCE
        );
        claimManager.attachAssessment(claimId);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        claimManager.approveClaim(claimId, CLAIM_50K);
    }

    // --- ClaimManager: constructor + parameter guards ---

    function test_claimManager_constructorRevertsOnZeroReceipt() public {
        vm.expectRevert(ClaimManager.ClaimManager__InvalidParams.selector);
        new ClaimManager(address(protocolRoles), address(portfolioRegistry), address(assessor), address(0));
    }

    function test_submitClaim_revertsOnZeroAmount() public {
        vm.prank(cedant);
        vm.expectRevert(ClaimManager.ClaimManager__InvalidParams.selector);
        claimManager.submitClaim(address(vault), pid, 0, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);
    }

    function test_submitClaim_revertsOnUnclaimablePortfolio() public {
        // SUBMITTED (never approved/activated) portfolios cannot be claimed against.
        vm.prank(cedant);
        uint256 draftPid = portfolioRegistry.submitPortfolio(_submission("Draft portfolio"));
        vm.prank(cedant);
        vm.expectRevert(abi.encodeWithSelector(ClaimManager.ClaimManager__PortfolioNotClaimable.selector, draftPid));
        claimManager.submitClaim(address(vault), draftPid, CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);
    }

    // --- ClaimManager: lifecycle transition guards ---

    function test_disputeClaim_revertsOnApprovedClaim() public {
        uint256 claimId = _toApproved();
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                ClaimManager.ClaimManager__InvalidStatus.selector, claimId, ClaimManager.ClaimStatus.APPROVED
            )
        );
        claimManager.disputeClaim(claimId, "too late: committee already ruled");
    }

    function test_freezeClaim_revertsOnRejectedClaim() public {
        uint256 claimId = _submit(ClaimManager.ClaimType.NON_PARAMETRIC);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        claimManager.rejectClaim(claimId, "no coverage");
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                ClaimManager.ClaimManager__InvalidStatus.selector, claimId, ClaimManager.ClaimStatus.REJECTED
            )
        );
        claimManager.freezeClaim(claimId);
    }

    function test_rejectClaim_revertsOnPaidClaim() public {
        uint256 claimId = _toApproved();
        claimManager.executeClaim(claimId);
        vm.prank(committee);
        vm.expectRevert(
            abi.encodeWithSelector(
                ClaimManager.ClaimManager__InvalidStatus.selector, claimId, ClaimManager.ClaimStatus.PAID
            )
        );
        claimManager.rejectClaim(claimId, "cannot reject a settled claim");
    }

    function test_approveParametric_revertsOnSecondApproval() public {
        // Parametric path: first approval is valid from SUBMITTED; a second
        // approval must hit the parametric status guard (not the frozen one).
        uint256 claimId = _submit(ClaimManager.ClaimType.PARAMETRIC);
        vm.prank(committee);
        claimManager.approveClaim(claimId, CLAIM_50K);
        vm.prank(committee);
        vm.expectRevert(
            abi.encodeWithSelector(
                ClaimManager.ClaimManager__InvalidStatus.selector, claimId, ClaimManager.ClaimStatus.APPROVED
            )
        );
        claimManager.approveClaim(claimId, CLAIM_50K);
    }

    // --- RedemptionQueue: constructor bounds, pause gate, duration update ---

    function test_queue_constructorRevertsOutOfBounds() public {
        vm.expectRevert(abi.encodeWithSelector(RedemptionQueue.RQ__BadEpochDuration.selector, uint64(1 hours) - 1));
        new RedemptionQueue(address(protocolRoles), address(vault), uint64(1 hours) - 1);
        vm.expectRevert(abi.encodeWithSelector(RedemptionQueue.RQ__BadEpochDuration.selector, uint64(90 days) + 1));
        new RedemptionQueue(address(protocolRoles), address(vault), uint64(90 days) + 1);
    }

    function test_queue_settleRevertsWhenPaused() public {
        RedemptionQueue queue = new RedemptionQueue(address(protocolRoles), address(vault), 1 days);
        vm.prank(sentinel);
        queue.setPaused(true);
        vm.warp(block.timestamp + 2 days);
        vm.prank(keeper);
        vm.expectRevert(RedemptionQueue.RQ__QueuePaused.selector);
        queue.settleEpoch();
    }

    function test_queue_setEpochDurationBoundsAndSuccess() public {
        RedemptionQueue queue = new RedemptionQueue(address(protocolRoles), address(vault), 1 days);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RedemptionQueue.RQ__BadEpochDuration.selector, uint64(0)));
        queue.setEpochDuration(0);

        vm.prank(admin);
        queue.setEpochDuration(2 days);
        assertEq(queue.epochDuration(), 2 days, "duration updated");
    }

    // --- VaultAllocator: role modifier + oracle wiring ---

    function test_allocator_unauthorizedRoleReverts() public {
        VaultAllocator allocator = new VaultAllocator(address(protocolRoles), address(portfolioRegistry), address(0));
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(rando);
        vm.expectRevert(
            abi.encodeWithSelector(VaultAllocator.VaultAllocator__UnauthorizedRole.selector, rando, ownerRole)
        );
        allocator.setNavOracle(address(oracle));
    }

    function test_allocator_setNavOracle() public {
        VaultAllocator allocator = new VaultAllocator(address(protocolRoles), address(portfolioRegistry), address(0));
        vm.prank(admin);
        allocator.setNavOracle(address(oracle));
        assertEq(address(allocator.navOracle()), address(oracle), "oracle wired");
    }

    // --- InsuranceVault: buffer ceiling on withdrawals ---

    function test_vault_withdrawBeyondBufferReverts() public {
        // With capital committed to underwriting, the liquidity-lock invariant
        // caps withdrawals to the free buffer: asking the full deposit reverts.
        vm.prank(admin);
        vault.setVaultAllocator(admin);
        vm.prank(admin);
        vault.allocateToPortfolio(pid, COVERAGE_150K);

        uint256 available = vault.maxWithdraw(lp);
        assertLt(available, DEPOSIT_200K, "buffer must cap withdrawals");
        vm.prank(lp);
        vm.expectRevert();
        vault.withdraw(DEPOSIT_200K, lp, lp);
    }
}
