// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title AIAssessor
/// @author Anton Carlo Santoro
/// @notice ADVISORY mock store for Braino.ai/WAVENURE claim assessments:
///         validity score, anomaly score, confidence, recommendation,
///         recommended reserve amount and the sourceHash of the model report.
///
///         HARD BOUNDARY: this contract has NO authority. It cannot approve
///         claims, move funds, call the vault or the ClaimManager. The AI can
///         signal, estimate and classify — approval belongs exclusively to the
///         Claims Committee, payouts exclusively to the vault.
contract AIAssessor is ProtocolRoleConstants {
    // --- Constants ---
    /// @notice Basis-points denominator (100% = 10_000).
    uint256 public constant MAX_BPS = 10_000;

    /// @notice Default anomaly threshold: an assessment with anomalyScoreBps at or
    ///         above 70% flags the claim as anomalous (auto-freeze in ClaimManager).
    uint16 public constant DEFAULT_ANOMALY_THRESHOLD_BPS = 7_000;

    /// @notice Hard floor for the configurable anomaly threshold: 50%.
    uint16 public constant ANOMALY_THRESHOLD_FLOOR_BPS = 5_000;

    // --- Enums / Structs ---
    enum Recommendation {
        MANUAL_REVIEW, // 0: default, defer entirely to the committee
        APPROVE, // 1: model suggests approval (advisory only)
        REJECT // 2: model suggests rejection (advisory only)
    }

    struct Assessment {
        uint16 scoreBps; // claim validity score, 0..10000
        uint16 anomalyScoreBps; // anomaly likelihood, 0..10000
        uint16 confidenceBps; // model confidence, 0..10000
        Recommendation recommendation;
        uint256 recommendedAmount; // suggested reserve/payout (advisory)
        bytes32 sourceHash; // hash of the off-chain model report
        uint64 assessedAt;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice Anomaly score (bps) at/above which an assessment is flagged for review.
    uint16 public anomalyThresholdBps;

    mapping(uint256 => Assessment) private _assessments; // claimId => assessment

    // --- Events ---
    /// @notice Emitted when the oracle publishes an AI claim assessment.
    event AssessmentPublished(
        uint256 indexed claimId,
        uint16 scoreBps,
        uint16 anomalyScoreBps,
        uint16 confidenceBps,
        Recommendation recommendation,
        uint256 recommendedAmount,
        bytes32 sourceHash
    );
    /// @notice Emitted when the anomaly threshold is reconfigured.
    event AnomalyThresholdUpdated(uint16 thresholdBps);

    // --- Errors ---
    /// @notice Caller lacks the required ProtocolRoles role.
    error AIAssessor__UnauthorizedRole(address caller, bytes32 role);
    /// @notice Zero address/value or otherwise malformed parameters.
    error AIAssessor__InvalidParams();
    /// @notice A bps score exceeds MAX_BPS.
    error AIAssessor__ScoreOutOfBounds(uint256 value);
    /// @notice No assessment stored for this claim.
    error AIAssessor__NoAssessment(uint256 claimId);

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert AIAssessor__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    /// @notice Wires the central ProtocolRoles access manager.
    constructor(address protocolRoles_) {
        if (protocolRoles_ == address(0)) revert AIAssessor__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
        anomalyThresholdBps = DEFAULT_ANOMALY_THRESHOLD_BPS;
        emit AnomalyThresholdUpdated(DEFAULT_ANOMALY_THRESHOLD_BPS);
    }

    // --- Publishing (ORACLE_ROLE: the Braino.ai/WAVENURE feed) ---

    /// @notice Publish (or update) the advisory assessment for a claim.
    ///         Pure data store: nothing is approved or paid as a consequence.
    function publishAssessment(
        uint256 claimId,
        uint16 scoreBps,
        uint16 anomalyScoreBps,
        uint16 confidenceBps,
        Recommendation recommendation,
        uint256 recommendedAmount,
        bytes32 sourceHash
    ) external onlyProtocolRole(ORACLE_ROLE) {
        if (sourceHash == bytes32(0)) revert AIAssessor__InvalidParams();
        if (scoreBps > MAX_BPS) revert AIAssessor__ScoreOutOfBounds(scoreBps);
        if (anomalyScoreBps > MAX_BPS) revert AIAssessor__ScoreOutOfBounds(anomalyScoreBps);
        if (confidenceBps > MAX_BPS) revert AIAssessor__ScoreOutOfBounds(confidenceBps);

        _assessments[claimId] = Assessment({
            scoreBps: scoreBps,
            anomalyScoreBps: anomalyScoreBps,
            confidenceBps: confidenceBps,
            recommendation: recommendation,
            recommendedAmount: recommendedAmount,
            sourceHash: sourceHash,
            assessedAt: uint64(block.timestamp)
        });

        emit AssessmentPublished(
            claimId, scoreBps, anomalyScoreBps, confidenceBps, recommendation, recommendedAmount, sourceHash
        );
    }

    // --- Configuration (OWNER_ROLE) ---

    /// @notice Update the anomaly threshold within the documented floor.
    function setAnomalyThreshold(uint16 thresholdBps) external onlyProtocolRole(OWNER_ROLE) {
        if (thresholdBps < ANOMALY_THRESHOLD_FLOOR_BPS || thresholdBps > MAX_BPS) {
            revert AIAssessor__InvalidParams();
        }
        anomalyThresholdBps = thresholdBps;
        emit AnomalyThresholdUpdated(thresholdBps);
    }

    // --- Views ---

    /// @notice True when an assessment exists for `claimId`.
    function hasAssessment(uint256 claimId) public view returns (bool) {
        return _assessments[claimId].assessedAt != 0;
    }

    /// @notice Stored assessment for `claimId` (reverts when missing).
    function getAssessment(uint256 claimId) external view returns (Assessment memory) {
        Assessment memory a = _assessments[claimId];
        if (a.assessedAt == 0) revert AIAssessor__NoAssessment(claimId);
        return a;
    }

    /// @notice True if the assessment flags the claim as anomalous.
    function isAnomalous(uint256 claimId) external view returns (bool) {
        Assessment memory a = _assessments[claimId];
        if (a.assessedAt == 0) revert AIAssessor__NoAssessment(claimId);
        return a.anomalyScoreBps >= anomalyThresholdBps;
    }
}
