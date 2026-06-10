// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {PortfolioRegistry} from "../src/PortfolioRegistry.sol";
import {BordereauOracle} from "../src/BordereauOracle.sol";

/// @title BordereauOracleTest
/// @notice Phase 8 suite: liveness window, sentinel dispute vs committee
///         resolution (separate powers), permissionless finalization, terminal
///         states, latestFinalized tracking and no-economic-effect guarantee.
contract BordereauOracleTest is Test {
    ProtocolRoles public protocolRoles;
    PortfolioRegistry public portfolioRegistry;
    BordereauOracle public bordereau;

    address public admin = makeAddr("admin");
    address public cedant = makeAddr("cedant");
    address public oracleNode = makeAddr("oracleNode");
    address public sentinel = makeAddr("sentinel");
    address public committee = makeAddr("committee");
    address public attacker = makeAddr("attacker");

    uint256 public pid;

    bytes32 constant DATA_HASH = keccak256("premium-bordereau-2026-Q2");
    uint256 constant DECLARED_100K = 100_000e6;

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        portfolioRegistry = new PortfolioRegistry(address(protocolRoles));
        bordereau = new BordereauOracle(address(protocolRoles), address(portfolioRegistry));

        protocolRoles.grantRole(protocolRoles.AUTHORIZED_CEDANT_ROLE(), cedant);
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        protocolRoles.grantRole(protocolRoles.SENTINEL_ROLE(), sentinel);
        protocolRoles.grantRole(protocolRoles.CLAIMS_COMMITTEE_ROLE(), committee);
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
                coverageLimit: 1_000_000e6,
                cededPremium: DECLARED_100K,
                inceptionTime: uint64(block.timestamp),
                expiryTime: uint64(block.timestamp + 365 days)
            })
        );
    }

    function _propose() internal returns (uint256 id) {
        vm.prank(cedant);
        id = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "ipfs://QmBordereau", DECLARED_100K
        );
    }

    // =========== PROPOSAL ===========

    function test_propose_byCedantAndOracle() public {
        uint256 id0 = _propose();
        assertEq(id0, 0);

        vm.prank(oracleNode);
        uint256 id1 = bordereau.proposeAssertion(
            pid, BordereauOracle.AssertionType.CLAIMS_BORDEREAU, keccak256("claims"), "ipfs://x", 5_000e6
        );
        assertEq(id1, 1);
        assertEq(bordereau.getAssertionCount(), 2);

        BordereauOracle.Assertion memory a = bordereau.getAssertion(id0);
        assertEq(a.dataHash, DATA_HASH);
        assertEq(a.declaredAmount, DECLARED_100K);
        assertEq(uint8(a.status), uint8(BordereauOracle.AssertionStatus.PROPOSED));
        assertEq(a.livenessDeadline, uint64(block.timestamp) + bordereau.liveness());
    }

    function test_propose_unauthorized_reverts() public {
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(BordereauOracle.BordereauOracle__UnauthorizedProposer.selector, attacker)
        );
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "", 1);
    }

    function test_propose_invalidParams_revert() public {
        vm.prank(cedant);
        vm.expectRevert(BordereauOracle.BordereauOracle__InvalidParams.selector);
        bordereau.proposeAssertion(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, bytes32(0), "", 1);

        vm.prank(cedant);
        vm.expectRevert(abi.encodeWithSelector(PortfolioRegistry.PortfolioRegistry__NotFound.selector, 999));
        bordereau.proposeAssertion(999, BordereauOracle.AssertionType.PREMIUM_BORDEREAU, DATA_HASH, "", 1);
    }

    // =========== LIVENESS & FINALIZATION ===========

    function test_finalize_beforeLiveness_reverts() public {
        uint256 id = _propose();
        BordereauOracle.Assertion memory a = bordereau.getAssertion(id);

        vm.expectRevert(
            abi.encodeWithSelector(BordereauOracle.BordereauOracle__LivenessActive.selector, id, a.livenessDeadline)
        );
        bordereau.finalizeAssertion(id);
    }

    function test_finalize_afterLiveness_permissionless() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);

        vm.prank(attacker); // anyone can finalize
        vm.expectEmit(true, true, false, true);
        emit BordereauOracle.AssertionFinalized(id, pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        bordereau.finalizeAssertion(id);

        assertTrue(bordereau.isFinalized(id));

        // latestFinalized tracks it
        BordereauOracle.Assertion memory latest =
            bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(latest.assertionId, id);
    }

    function test_finalized_isTerminal() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);
        bordereau.finalizeAssertion(id);

        // Cannot dispute or re-finalize a finalized assertion
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(
                BordereauOracle.BordereauOracle__InvalidStatus.selector, id, BordereauOracle.AssertionStatus.FINALIZED
            )
        );
        bordereau.disputeAssertion(id, "late");

        vm.expectRevert(
            abi.encodeWithSelector(
                BordereauOracle.BordereauOracle__InvalidStatus.selector, id, BordereauOracle.AssertionStatus.FINALIZED
            )
        );
        bordereau.finalizeAssertion(id);
    }

    function test_latestFinalized_updatesAcrossAssertions() public {
        uint256 id0 = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);
        bordereau.finalizeAssertion(id0);

        // Newer assertion for the same portfolio/type
        uint256 id1 = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);
        bordereau.finalizeAssertion(id1);

        BordereauOracle.Assertion memory latest =
            bordereau.latestFinalized(pid, BordereauOracle.AssertionType.PREMIUM_BORDEREAU);
        assertEq(latest.assertionId, id1);
    }

    function test_latestFinalized_noneReverts() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                BordereauOracle.BordereauOracle__NoFinalizedAssertion.selector,
                pid,
                BordereauOracle.AssertionType.CLAIMS_BORDEREAU
            )
        );
        bordereau.latestFinalized(pid, BordereauOracle.AssertionType.CLAIMS_BORDEREAU);
    }

    // =========== DISPUTE: SENTINEL FLAGS, COMMITTEE RESOLVES ===========

    function test_dispute_onlySentinel_withinLiveness() public {
        uint256 id = _propose();

        bytes32 sentinelRole = protocolRoles.SENTINEL_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(BordereauOracle.BordereauOracle__UnauthorizedRole.selector, attacker, sentinelRole)
        );
        bordereau.disputeAssertion(id, "x");

        vm.prank(sentinel);
        vm.expectEmit(true, true, false, true);
        emit BordereauOracle.AssertionDisputed(id, sentinel, "declared premium inconsistent");
        bordereau.disputeAssertion(id, "declared premium inconsistent");

        assertEq(uint8(bordereau.getAssertion(id).status), uint8(BordereauOracle.AssertionStatus.DISPUTED));
        assertEq(bordereau.getAssertion(id).disputer, sentinel);
    }

    function test_dispute_afterLiveness_reverts() public {
        uint256 id = _propose();
        BordereauOracle.Assertion memory a = bordereau.getAssertion(id);

        vm.warp(uint256(a.livenessDeadline) + 1);
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(BordereauOracle.BordereauOracle__LivenessElapsed.selector, id, a.livenessDeadline)
        );
        bordereau.disputeAssertion(id, "too late");
    }

    function test_resolution_separatePower() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "anomaly");

        // The Sentinel CANNOT resolve its own dispute
        bytes32 committeeRole = protocolRoles.CLAIMS_COMMITTEE_ROLE();
        vm.prank(sentinel);
        vm.expectRevert(
            abi.encodeWithSelector(BordereauOracle.BordereauOracle__UnauthorizedRole.selector, sentinel, committeeRole)
        );
        bordereau.resolveDispute(id, true);

        // Committee upholds -> terminal rejection
        vm.prank(committee);
        bordereau.resolveDispute(id, true);
        assertEq(uint8(bordereau.getAssertion(id).status), uint8(BordereauOracle.AssertionStatus.REJECTED));

        // Rejected is terminal: cannot finalize
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(
            abi.encodeWithSelector(
                BordereauOracle.BordereauOracle__InvalidStatus.selector, id, BordereauOracle.AssertionStatus.REJECTED
            )
        );
        bordereau.finalizeAssertion(id);
    }

    function test_resolution_dismiss_finalizes() public {
        uint256 id = _propose();
        vm.prank(sentinel);
        bordereau.disputeAssertion(id, "anomaly");

        // Committee dismisses the dispute -> assertion verified and finalized
        vm.prank(committee);
        bordereau.resolveDispute(id, false);
        assertTrue(bordereau.isFinalized(id));
    }

    // =========== NO ECONOMIC EFFECT ===========

    function test_noFundsEverHeld() public {
        uint256 id = _propose();
        vm.warp(block.timestamp + bordereau.liveness() + 1);
        bordereau.finalizeAssertion(id);

        // The oracle has no token functions and no balance; finalization changed
        // nothing outside its own storage (no vault, no distributor references).
        assertEq(address(bordereau).balance, 0);
    }

    // =========== CONFIG ===========

    function test_setLiveness_boundsAndGate() public {
        uint64 livenessFloor = bordereau.LIVENESS_FLOOR();
        uint64 livenessCeiling = bordereau.LIVENESS_CEILING();

        vm.prank(attacker);
        vm.expectRevert();
        bordereau.setLiveness(1 days);

        vm.startPrank(admin);
        vm.expectRevert(BordereauOracle.BordereauOracle__InvalidParams.selector);
        bordereau.setLiveness(livenessFloor - 1);
        vm.expectRevert(BordereauOracle.BordereauOracle__InvalidParams.selector);
        bordereau.setLiveness(livenessCeiling + 1);

        bordereau.setLiveness(5 days);
        vm.stopPrank();
        assertEq(bordereau.liveness(), 5 days);
    }

    // =========== FUZZ ===========

    function testFuzz_livenessBoundary(uint64 elapsed) public {
        uint256 id = _propose();
        uint64 deadline = bordereau.getAssertion(id).livenessDeadline;
        elapsed = uint64(bound(elapsed, 0, 90 days));

        vm.warp(block.timestamp + elapsed);

        if (uint64(block.timestamp) <= deadline) {
            vm.expectRevert(
                abi.encodeWithSelector(BordereauOracle.BordereauOracle__LivenessActive.selector, id, deadline)
            );
            bordereau.finalizeAssertion(id);
        } else {
            bordereau.finalizeAssertion(id);
            assertTrue(bordereau.isFinalized(id));
        }
    }
}
