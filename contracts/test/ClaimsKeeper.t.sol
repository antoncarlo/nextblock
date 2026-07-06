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
import {BordereauOracle} from "../src/BordereauOracle.sol";
import {ClaimsKeeper} from "../script/ClaimsKeeper.s.sol";

/// @title ClaimsKeeperTest
/// @author Anton Carlo Santoro
/// @notice The keeper must pay exactly the committee-APPROVED unfrozen claims
///         and finalize exactly the liveness-elapsed PROPOSED assertions —
///         nothing else, never reverting, bounded by maxActions.
contract ClaimsKeeperTest is Test {
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
    BordereauOracle internal bordereau;
    ClaimsKeeper internal keeper;

    address internal admin = makeAddr("admin");
    address internal managerA = makeAddr("managerA");
    address internal cedant = makeAddr("cedant");
    address internal committee = makeAddr("committee");
    address internal sentinel = makeAddr("sentinel");
    address internal oracleNode = makeAddr("oracleNode");
    address internal lp = makeAddr("lp");
    // Any funded key works: both keeper entrypoints are permissionless.
    uint256 internal keeperPk = 0xA11CE;

    uint256 internal pid;

    uint256 constant DEPOSIT_200K = 200_000e6;
    uint256 constant COVERAGE_150K = 150_000e6;
    uint256 constant CLAIM_50K = 50_000e6;
    bytes32 constant EVIDENCE = keccak256("evidence");
    bytes32 constant AI_SOURCE = keccak256("ai-source");
    bytes32 constant DATA_HASH = keccak256("bordereau-dataset");

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
        bordereau = new BordereauOracle(address(protocolRoles), address(portfolioRegistry));

        protocolRoles.grantRole(protocolRoles.UNDERWRITING_CURATOR_ROLE(), admin);
        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
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
        pid = portfolioRegistry.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
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
            })
        );
        vm.startPrank(admin);
        portfolioRegistry.startReview(pid);
        portfolioRegistry.approvePortfolio(pid, 6_500);
        portfolioRegistry.activatePortfolio(pid);
        vm.stopPrank();

        vm.startPrank(lp);
        usdc.approve(address(vault), DEPOSIT_200K);
        vault.deposit(DEPOSIT_200K, lp);
        vm.stopPrank();

        keeper = new ClaimsKeeper();
    }

    // --- Helpers ---

    function _toApproved(uint256 amount) internal returns (uint256 claimId) {
        vm.prank(cedant);
        claimId = claimManager.submitClaim(address(vault), pid, amount, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);
        vm.prank(oracleNode);
        assessor.publishAssessment(claimId, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, amount, AI_SOURCE);
        claimManager.attachAssessment(claimId);
        vm.warp(block.timestamp + claimManager.disputeWindow() + 1);
        vm.prank(committee);
        claimManager.approveClaim(claimId, amount);
    }

    function _propose() internal returns (uint256 assertionId) {
        vm.prank(cedant);
        assertionId = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://QmB", 15_000e6
        );
    }

    // --- Claims path ---

    function test_sweep_paysApprovedClaim() public {
        uint256 claimId = _toApproved(CLAIM_50K);
        uint256 cedantBefore = usdc.balanceOf(cedant);

        (uint256 executed, uint256 finalized) =
            keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());

        assertEq(executed, 1, "one claim executed");
        assertEq(finalized, 0, "no assertions touched");
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.PAID));
        assertEq(usdc.balanceOf(cedant) - cedantBefore, CLAIM_50K, "claimant paid from vault reserve");
    }

    function test_sweep_skipsFrozenClaim() public {
        uint256 claimId = _toApproved(CLAIM_50K);
        vm.prank(sentinel);
        claimManager.freezeClaim(claimId);

        (uint256 executed,) = keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());

        assertEq(executed, 0, "frozen claim untouched");
        assertEq(uint8(claimManager.getClaim(claimId).status), uint8(ClaimManager.ClaimStatus.APPROVED));
    }

    function test_sweep_skipsNonApprovedStatuses() public {
        vm.prank(cedant);
        claimManager.submitClaim(address(vault), pid, CLAIM_50K, ClaimManager.ClaimType.NON_PARAMETRIC, EVIDENCE);

        (uint256 executed,) = keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());

        assertEq(executed, 0, "submitted-only claim untouched");
    }

    function test_sweep_idempotent() public {
        _toApproved(CLAIM_50K);
        keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());
        (uint256 executedAgain, uint256 finalizedAgain) =
            keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());
        assertEq(executedAgain + finalizedAgain, 0, "second run is a no-op");
    }

    // --- Assertions path ---

    function test_sweep_finalizesElapsedAssertion() public {
        uint256 assertionId = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);

        (uint256 executed, uint256 finalized) =
            keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());

        assertEq(executed, 0);
        assertEq(finalized, 1, "one assertion finalized");
        assertEq(uint8(bordereau.getAssertion(assertionId).status), uint8(BordereauOracle.AssertionStatus.FINALIZED));
    }

    function test_sweep_respectsLiveness() public {
        uint256 assertionId = _propose();
        // Liveness still running: keeper must not touch it.
        (, uint256 finalized) = keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());
        assertEq(finalized, 0, "live assertion untouched");
        assertEq(uint8(bordereau.getAssertion(assertionId).status), uint8(BordereauOracle.AssertionStatus.PROPOSED));
    }

    function test_sweep_skipsDisputedAssertion() public {
        uint256 assertionId = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(assertionId, "figures disagree with treaty");
        vm.warp(block.timestamp + bordereau.liveness() + 1);

        (, uint256 finalized) = keeper.sweep(address(claimManager), address(bordereau), keeperPk, keeper.MAX_ACTIONS());
        assertEq(finalized, 0, "disputed assertion left to the committee");
    }

    // --- Bound ---

    function test_sweep_respectsMaxActions() public {
        _toApproved(10_000e6);
        _toApproved(10_000e6);
        uint256 a = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);

        (uint256 executed, uint256 finalized) = keeper.sweep(address(claimManager), address(bordereau), keeperPk, 1);
        assertEq(executed + finalized, 1, "exactly one action under maxActions=1");

        // Backlog drains across subsequent runs.
        (uint256 e2, uint256 f2) = keeper.sweep(address(claimManager), address(bordereau), keeperPk, 10);
        assertEq(e2 + f2, 2, "remaining actions on the next run");
        assertEq(uint8(bordereau.getAssertion(a).status), uint8(BordereauOracle.AssertionStatus.FINALIZED));
    }
}
