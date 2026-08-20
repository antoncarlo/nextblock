// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";
import {ClaimReceipt} from "../src/ClaimReceipt.sol";
import {ClaimManager} from "../src/ClaimManager.sol";
import {AIAssessor} from "../src/AIAssessor.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";

/// @title ClaimOwnershipTest
/// @author Anton Carlo Santoro
/// @notice A cedant may claim on the book it ceded, and on no other.
///
/// @dev Two cedants exist here rather than one, because with a single cedant the
///      question cannot be asked. "Can a cedant file a claim" is not the
///      interesting question — "can cedant B draw on cedant A's portfolio" is,
///      and a protocol where that succeeds pays out against exposure the
///      claimant never took on. That is not a bug in the accounting; it is a
///      party being handed someone else's cover.
///
///      Written as fixed numbers alongside the fuzzed invariant, because the
///      invariant only proves the rule held wherever the fuzzer happened to
///      go. This proves the refusal exists and names the error it raises.
contract ClaimOwnershipTest is Test {
    ProtocolRoles internal roles;
    ComplianceRegistry internal compliance;
    PortfolioRegistry internal portfolios;
    PolicyRegistry internal policies;
    ClaimReceipt internal receipts;
    ClaimManager internal claims;
    AIAssessor internal assessor;
    MockUSDC internal usdc;
    MockOracle internal oracle;
    InsuranceVault internal vault;

    address internal governance = makeAddr("governance");
    address internal curator = makeAddr("curator");
    address internal kycKey = makeAddr("kyc");
    address internal cedantA = makeAddr("cedant_a");
    address internal cedantB = makeAddr("cedant_b");

    uint256 internal pidA;
    uint256 internal pidB;

    uint256 internal constant COVERAGE = 1_000_000e6;

    function setUp() public {
        vm.startPrank(governance);
        roles = new ProtocolRoles(governance);
        usdc = new MockUSDC();
        oracle = new MockOracle();
        policies = new PolicyRegistry(address(roles));
        receipts = new ClaimReceipt();
        compliance = new ComplianceRegistry(address(roles));
        portfolios = new PortfolioRegistry(address(roles));

        roles.grantRole(roles.UNDERWRITING_CURATOR_ROLE(), curator);
        roles.grantRole(roles.KYC_OPERATOR_ROLE(), kycKey);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedantA);
        roles.grantRole(roles.AUTHORIZED_CEDANT_ROLE(), cedantB);

        vault = new InsuranceVault(
            InsuranceVault.VaultInitParams({
                asset: IERC20(address(usdc)),
                name: "Claim Ownership",
                symbol: "nbOWN",
                vaultName: "Claim Ownership",
                owner: governance,
                vaultManager: curator,
                bufferRatioBps: 2_000,
                managementFeeBps: 0,
                registry: address(policies),
                oracle: address(oracle),
                claimReceipt: address(receipts),
                protocolRoles: address(roles),
                complianceRegistry: address(compliance),
                portfolioRegistry: address(portfolios)
            })
        );
        assessor = new AIAssessor(address(roles));
        claims = new ClaimManager(address(roles), address(portfolios), address(assessor), address(receipts));
        vm.stopPrank();

        pidA = _activePortfolio("Book A", cedantA);
        pidB = _activePortfolio("Book B", cedantB);
    }

    /// @notice The ordinary case: a cedant claims on its own book and is heard.
    /// @dev First, because a refusal test that passes on a protocol which
    ///      refuses everything proves nothing at all.
    function test_cedantMayClaimOnItsOwnPortfolio() public {
        vm.prank(cedantA);
        uint256 claimId = claims.submitClaim(
            address(vault), pidA, 250_000e6, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_a")
        );

        ClaimManager.Claim memory c = claims.getClaim(claimId);
        assertEq(c.claimant, cedantA, "the claimant of record must be the filing cedant");
        assertEq(c.portfolioId, pidA, "the claim must be bound to the portfolio it names");
        assertEq(c.requestedAmount, 250_000e6, "the requested amount must be recorded as filed");
    }

    /// @notice The refusal that matters: cedant B cannot claim on cedant A's book.
    function test_cedantCannotClaimOnAnotherCedantsPortfolio() public {
        vm.prank(cedantB);
        vm.expectRevert(abi.encodeWithSelector(ClaimManager.ClaimManager__NotPortfolioCedant.selector, pidA, cedantB));
        claims.submitClaim(address(vault), pidA, 250_000e6, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_b"));
    }

    /// @notice Holding the cedant role is not the same as owning the book.
    /// @dev The role gate and the ownership check are separate defences, and
    ///      this asserts the second one carries weight on its own. Both cedants
    ///      here are fully authorised; only one of them ceded this portfolio.
    function test_theRoleGateIsNotWhatStopsTheForeignClaim() public {
        assertTrue(roles.hasRole(roles.AUTHORIZED_CEDANT_ROLE(), cedantB), "cedant B is authorised");

        vm.prank(cedantB);
        vm.expectRevert(abi.encodeWithSelector(ClaimManager.ClaimManager__NotPortfolioCedant.selector, pidA, cedantB));
        claims.submitClaim(address(vault), pidA, 1e6, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_c"));

        // The same party, on its own book, at the same amount: accepted. So the
        // refusal above was about ownership and nothing else.
        vm.prank(cedantB);
        uint256 claimId =
            claims.submitClaim(address(vault), pidB, 1e6, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_d"));
        assertEq(claims.getClaim(claimId).claimant, cedantB, "cedant B may claim on cedant B's book");
    }

    /// @notice A claim cannot exceed what the portfolio covers.
    /// @dev One unit over the limit — the smallest request that must be refused.
    ///      A wildly larger figure could revert for an unrelated reason and
    ///      prove nothing about the ceiling.
    function test_claimAboveCoverageIsRefused() public {
        vm.prank(cedantA);
        vm.expectRevert(
            abi.encodeWithSelector(ClaimManager.ClaimManager__AmountExceedsCoverage.selector, COVERAGE + 1, COVERAGE)
        );
        claims.submitClaim(
            address(vault), pidA, COVERAGE + 1, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_e")
        );

        // Exactly at the limit is inside it.
        vm.prank(cedantA);
        uint256 claimId = claims.submitClaim(
            address(vault), pidA, COVERAGE, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_f")
        );
        assertEq(claims.getClaim(claimId).requestedAmount, COVERAGE, "the coverage limit itself must be claimable");
    }

    /// @notice An approved-but-inactive book cannot be claimed against.
    /// @dev This is the state the invariant suite sat in without anybody
    ///      noticing: every portfolio approved, none activated, so every claim
    ///      reverted here and the claim invariants asserted over an empty set.
    ///      Recorded as a test so the same silence cannot return unremarked.
    function test_approvedButInactivePortfolioRefusesClaims() public {
        vm.prank(cedantA);
        uint256 pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: "Approved Only",
                metadataURI: "ipfs://QmApproved",
                documentHash: keccak256("approved_only"),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE,
                cededPremium: 100_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.prank(curator);
        portfolios.startReview(pid);
        vm.prank(curator);
        portfolios.approvePortfolio(pid, 6_500);

        vm.prank(cedantA);
        vm.expectRevert(abi.encodeWithSelector(ClaimManager.ClaimManager__PortfolioNotClaimable.selector, pid));
        claims.submitClaim(address(vault), pid, 1e6, ClaimManager.ClaimType.PARAMETRIC, keccak256("evidence_g"));
    }

    function _activePortfolio(string memory name, address cedant) internal returns (uint256 pid) {
        vm.prank(cedant);
        pid = portfolios.submitPortfolio(
            PortfolioRegistry.SubmissionParams({
                name: name,
                metadataURI: "ipfs://QmBook",
                documentHash: keccak256(bytes(name)),
                lineOfBusiness: "Mixed",
                jurisdiction: "EU",
                structureType: PortfolioRegistry.StructureType.QUOTA_SHARE,
                coverageLimit: COVERAGE,
                cededPremium: 100_000e6,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
        vm.prank(curator);
        portfolios.startReview(pid);
        vm.prank(curator);
        portfolios.approvePortfolio(pid, 6_500);
        vm.prank(curator);
        portfolios.activatePortfolio(pid);
    }
}
