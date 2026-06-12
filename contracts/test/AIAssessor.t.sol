// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {AIAssessor} from "../src/AIAssessor.sol";

/// @title AIAssessorTest
/// @author Anton Carlo Santoro
/// @notice Dedicated suite for the advisory assessment store: role gates,
///         parameter bounds on every score, threshold floor/ceiling,
///         missing-assessment reverts and the anomaly flag boundary. The
///         contract is a pure data store; nothing here approves or pays.
contract AIAssessorTest is Test {
    ProtocolRoles public protocolRoles;
    AIAssessor public assessor;

    address public admin = makeAddr("admin");
    address public oracleNode = makeAddr("brainoOracleNode");
    address public attacker = makeAddr("attacker");

    uint256 constant CLAIM_ID = 42;
    bytes32 constant SOURCE_HASH = keccak256("braino-claim-report-2026-06-13");

    event AssessmentPublished(
        uint256 indexed claimId,
        uint16 scoreBps,
        uint16 anomalyScoreBps,
        uint16 confidenceBps,
        AIAssessor.Recommendation recommendation,
        uint256 recommendedAmount,
        bytes32 sourceHash
    );
    event AnomalyThresholdUpdated(uint16 thresholdBps);

    function setUp() public {
        vm.startPrank(admin);
        protocolRoles = new ProtocolRoles(admin);
        assessor = new AIAssessor(address(protocolRoles));
        protocolRoles.grantRole(protocolRoles.ORACLE_ROLE(), oracleNode);
        vm.stopPrank();
    }

    function _publishDefault() internal {
        vm.prank(oracleNode);
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, 50_000e6, SOURCE_HASH
        );
    }

    // --- Constructor ---

    function test_constructor_initialState() public view {
        assertEq(assessor.anomalyThresholdBps(), assessor.DEFAULT_ANOMALY_THRESHOLD_BPS());
        assertEq(address(assessor.protocolRoles()), address(protocolRoles));
    }

    function test_constructor_revertsOnZeroRoles() public {
        vm.expectRevert(AIAssessor.AIAssessor__InvalidParams.selector);
        new AIAssessor(address(0));
    }

    // --- publishAssessment ---

    function test_publishAssessment_storesAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit AssessmentPublished(
            CLAIM_ID, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, 50_000e6, SOURCE_HASH
        );
        _publishDefault();

        assertTrue(assessor.hasAssessment(CLAIM_ID));
        AIAssessor.Assessment memory a = assessor.getAssessment(CLAIM_ID);
        assertEq(a.scoreBps, 8_000);
        assertEq(a.anomalyScoreBps, 1_000);
        assertEq(a.confidenceBps, 9_000);
        assertEq(uint8(a.recommendation), uint8(AIAssessor.Recommendation.APPROVE));
        assertEq(a.recommendedAmount, 50_000e6);
        assertEq(a.sourceHash, SOURCE_HASH);
        assertEq(a.assessedAt, uint64(block.timestamp));
    }

    function test_publishAssessment_updateOverwrites() public {
        _publishDefault();
        vm.prank(oracleNode);
        assessor.publishAssessment(
            CLAIM_ID, 2_000, 9_500, 7_000, AIAssessor.Recommendation.REJECT, 0, keccak256("revised")
        );
        AIAssessor.Assessment memory a = assessor.getAssessment(CLAIM_ID);
        assertEq(a.scoreBps, 2_000);
        assertEq(uint8(a.recommendation), uint8(AIAssessor.Recommendation.REJECT));
    }

    function test_publishAssessment_revertsForNonOracle() public {
        // Hoisted: an external call in the argument list would consume the prank.
        bytes32 oracleRole = protocolRoles.ORACLE_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__UnauthorizedRole.selector, attacker, oracleRole));
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, 50_000e6, SOURCE_HASH
        );
    }

    function test_publishAssessment_revertsOnZeroSourceHash() public {
        vm.prank(oracleNode);
        vm.expectRevert(AIAssessor.AIAssessor__InvalidParams.selector);
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, 50_000e6, bytes32(0)
        );
    }

    function test_publishAssessment_revertsOnScoreAboveMax() public {
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__ScoreOutOfBounds.selector, 10_001));
        assessor.publishAssessment(
            CLAIM_ID, 10_001, 1_000, 9_000, AIAssessor.Recommendation.APPROVE, 50_000e6, SOURCE_HASH
        );
    }

    function test_publishAssessment_revertsOnAnomalyAboveMax() public {
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__ScoreOutOfBounds.selector, 10_001));
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 10_001, 9_000, AIAssessor.Recommendation.APPROVE, 50_000e6, SOURCE_HASH
        );
    }

    function test_publishAssessment_revertsOnConfidenceAboveMax() public {
        vm.prank(oracleNode);
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__ScoreOutOfBounds.selector, 10_001));
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 1_000, 10_001, AIAssessor.Recommendation.APPROVE, 50_000e6, SOURCE_HASH
        );
    }

    // --- setAnomalyThreshold ---

    function test_setAnomalyThreshold_updatesAndEmits() public {
        vm.expectEmit(false, false, false, true);
        emit AnomalyThresholdUpdated(6_000);
        vm.prank(admin);
        assessor.setAnomalyThreshold(6_000);
        assertEq(assessor.anomalyThresholdBps(), 6_000);
    }

    function test_setAnomalyThreshold_revertsForNonOwner() public {
        // Hoisted: an external call in the argument list would consume the prank.
        bytes32 ownerRole = protocolRoles.OWNER_ROLE();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__UnauthorizedRole.selector, attacker, ownerRole));
        assessor.setAnomalyThreshold(6_000);
    }

    function test_setAnomalyThreshold_revertsBelowFloor() public {
        vm.prank(admin);
        vm.expectRevert(AIAssessor.AIAssessor__InvalidParams.selector);
        assessor.setAnomalyThreshold(4_999);
    }

    function test_setAnomalyThreshold_revertsAboveMax() public {
        vm.prank(admin);
        vm.expectRevert(AIAssessor.AIAssessor__InvalidParams.selector);
        assessor.setAnomalyThreshold(10_001);
    }

    function test_setAnomalyThreshold_acceptsBoundaries() public {
        // Hoisted: an external call in the argument list would consume the prank.
        uint16 floorBps = assessor.ANOMALY_THRESHOLD_FLOOR_BPS();
        uint16 maxBps = uint16(assessor.MAX_BPS());
        vm.prank(admin);
        assessor.setAnomalyThreshold(floorBps);
        assertEq(assessor.anomalyThresholdBps(), 5_000);
        vm.prank(admin);
        assessor.setAnomalyThreshold(maxBps);
        assertEq(assessor.anomalyThresholdBps(), 10_000);
    }

    // --- Views ---

    function test_hasAssessment_falseWhenMissing() public view {
        assertFalse(assessor.hasAssessment(CLAIM_ID));
    }

    function test_getAssessment_revertsWhenMissing() public {
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__NoAssessment.selector, CLAIM_ID));
        assessor.getAssessment(CLAIM_ID);
    }

    function test_isAnomalous_revertsWhenMissing() public {
        vm.expectRevert(abi.encodeWithSelector(AIAssessor.AIAssessor__NoAssessment.selector, CLAIM_ID));
        assessor.isAnomalous(CLAIM_ID);
    }

    function test_isAnomalous_boundaryAtThreshold() public {
        // Below threshold by one bps: not anomalous.
        vm.prank(oracleNode);
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 6_999, 9_000, AIAssessor.Recommendation.MANUAL_REVIEW, 0, SOURCE_HASH
        );
        assertFalse(assessor.isAnomalous(CLAIM_ID));

        // Exactly at threshold: anomalous (inclusive comparison).
        vm.prank(oracleNode);
        assessor.publishAssessment(
            CLAIM_ID, 8_000, 7_000, 9_000, AIAssessor.Recommendation.MANUAL_REVIEW, 0, SOURCE_HASH
        );
        assertTrue(assessor.isAnomalous(CLAIM_ID));
    }

    // --- Fuzz: bounds hold for any input combination ---

    function testFuzz_publishAssessment_boundsEnforced(uint16 scoreBps, uint16 anomalyBps, uint16 confidenceBps)
        public
    {
        scoreBps = uint16(bound(scoreBps, 0, 10_000));
        anomalyBps = uint16(bound(anomalyBps, 0, 10_000));
        confidenceBps = uint16(bound(confidenceBps, 0, 10_000));

        vm.prank(oracleNode);
        assessor.publishAssessment(
            CLAIM_ID, scoreBps, anomalyBps, confidenceBps, AIAssessor.Recommendation.MANUAL_REVIEW, 0, SOURCE_HASH
        );
        AIAssessor.Assessment memory a = assessor.getAssessment(CLAIM_ID);
        assertLe(a.scoreBps, 10_000);
        assertLe(a.anomalyScoreBps, 10_000);
        assertLe(a.confidenceBps, 10_000);
    }
}
