// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";

/// @title NavOracle
/// @author Anton Carlo Santoro
/// @notice Attestation layer for Braino.ai/WAVENURE data: per-vault NAV and
///         per-portfolio risk scores, each with a confidence score, timestamp and
///         a sourceHash anchoring the off-chain model report.
///
///         This contract is a MOCK-FED attestation store for the MVP:
///         - No external API is called; ORACLE_ROLE pushes signed-off data.
///         - It moves NO funds and triggers NO settlement; consumers (vault NAV
///           display, future ClaimManager/AIAssessor) must treat it as advisory
///           input, never as a direct source of fund movements.
///         - It does NOT replace the AIAssessor (Phase 9 of the module sequence).
///
///         Guard model:
///         - Staleness guard: reads revert once an attestation is older than
///           maxStaleness, so consumers can never act on stale data silently.
///         - Deviation guard: a NAV publish that deviates from the last accepted
///           value by more than maxDeviationBps is NOT applied; the anomaly is
///           recorded on-chain and the feed auto-pauses.
///         - Sentinel anomaly response: SENTINEL_ROLE investigates, may issue a
///           one-shot deviation waiver (acknowledgeDeviation) and unpause the
///           feed. The Sentinel never publishes data itself (role separation).
contract NavOracle is ProtocolRoleConstants {
    // --- Constants (documented guard bounds; no magic numbers) ---
    uint256 public constant MAX_BPS = 10_000;

    /// @notice Default staleness window: NAV older than 1 day is unusable.
    uint64 public constant DEFAULT_MAX_STALENESS = 1 days;

    /// @notice Hard bounds for the staleness window configuration.
    uint64 public constant STALENESS_FLOOR = 15 minutes;
    uint64 public constant STALENESS_CEILING = 30 days;

    /// @notice Default max NAV deviation between consecutive publishes: 20%.
    uint256 public constant DEFAULT_MAX_DEVIATION_BPS = 2_000;

    /// @notice Hard ceiling for the deviation guard configuration: 50%.
    uint256 public constant DEVIATION_CEILING_BPS = 5_000;

    /// @notice Default minimum confidence accepted from the model: 50%.
    uint16 public constant DEFAULT_MIN_CONFIDENCE_BPS = 5_000;

    // --- Structs ---
    struct NavAttestation {
        uint256 nav;           // vault NAV in USDC (6 decimals)
        uint16 confidenceBps;  // model confidence, 0..10000
        uint64 updatedAt;      // publish timestamp
        bytes32 sourceHash;    // hash of the off-chain report/payload
    }

    struct RiskAttestation {
        uint16 riskScoreBps;   // expected-loss / risk score, 0..10000
        uint16 confidenceBps;  // model confidence, 0..10000
        uint64 updatedAt;
        bytes32 sourceHash;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice Institutional portfolio registry (attested ids must exist).
    PortfolioRegistry public immutable portfolioRegistry;

    uint64 public maxStaleness;
    uint256 public maxDeviationBps;
    uint16 public minConfidenceBps;

    mapping(address => NavAttestation) private _vaultNav;
    mapping(uint256 => RiskAttestation) private _portfolioRisk;

    /// @notice Feed pause state per vault (Sentinel control + anomaly auto-pause).
    mapping(address => bool) public vaultFeedPaused;

    /// @notice Latched when a deviation anomaly is detected; cleared on unpause.
    mapping(address => bool) public vaultAnomalyFlagged;

    /// @notice One-shot deviation waiver issued by the Sentinel after review.
    mapping(address => bool) public deviationWaiver;

    // --- Events ---
    event NavPublished(address indexed vault, uint256 nav, uint16 confidenceBps, bytes32 sourceHash);
    event PortfolioRiskPublished(uint256 indexed portfolioId, uint16 riskScoreBps, uint16 confidenceBps, bytes32 sourceHash);
    event NavAnomalyDetected(address indexed vault, uint256 attemptedNav, uint256 lastAcceptedNav, uint256 deviationBps);
    event FeedPaused(address indexed vault, address indexed by);
    event FeedUnpaused(address indexed vault, address indexed by);
    event DeviationAcknowledged(address indexed vault, address indexed sentinel);
    event GuardsUpdated(uint64 maxStaleness, uint256 maxDeviationBps, uint16 minConfidenceBps);

    // --- Errors ---
    error NavOracle__UnauthorizedRole(address caller, bytes32 role);
    error NavOracle__InvalidParams();
    error NavOracle__FeedPaused(address vault);
    error NavOracle__NoAttestation(address vault);
    error NavOracle__StaleNav(address vault, uint64 updatedAt, uint64 maxStaleness);
    error NavOracle__NoRiskAttestation(uint256 portfolioId);
    error NavOracle__StaleRisk(uint256 portfolioId, uint64 updatedAt, uint64 maxStaleness);
    error NavOracle__ConfidenceTooLow(uint16 confidenceBps, uint16 minConfidenceBps);
    error NavOracle__ScoreOutOfBounds(uint256 value);

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert NavOracle__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(address protocolRoles_, address portfolioRegistry_) {
        if (protocolRoles_ == address(0) || portfolioRegistry_ == address(0)) {
            revert NavOracle__InvalidParams();
        }
        protocolRoles = ProtocolRoles(protocolRoles_);
        portfolioRegistry = PortfolioRegistry(portfolioRegistry_);

        maxStaleness = DEFAULT_MAX_STALENESS;
        maxDeviationBps = DEFAULT_MAX_DEVIATION_BPS;
        minConfidenceBps = DEFAULT_MIN_CONFIDENCE_BPS;
        emit GuardsUpdated(DEFAULT_MAX_STALENESS, DEFAULT_MAX_DEVIATION_BPS, DEFAULT_MIN_CONFIDENCE_BPS);
    }

    // --- Oracle Publishing (ORACLE_ROLE) ---

    /// @notice Publish a NAV attestation for a vault.
    ///         If the value deviates from the last accepted NAV by more than
    ///         maxDeviationBps the attestation is NOT applied: the anomaly is
    ///         recorded and the feed auto-pauses pending Sentinel review.
    /// @param vault Vault the NAV refers to
    /// @param nav NAV in USDC (6 decimals)
    /// @param confidenceBps Model confidence (>= minConfidenceBps)
    /// @param sourceHash Hash of the off-chain Braino.ai/WAVENURE report
    function publishNav(address vault, uint256 nav, uint16 confidenceBps, bytes32 sourceHash)
        external
        onlyProtocolRole(ORACLE_ROLE)
    {
        if (vault == address(0) || sourceHash == bytes32(0)) revert NavOracle__InvalidParams();
        if (confidenceBps > MAX_BPS) revert NavOracle__ScoreOutOfBounds(confidenceBps);
        if (confidenceBps < minConfidenceBps) {
            revert NavOracle__ConfidenceTooLow(confidenceBps, minConfidenceBps);
        }
        if (vaultFeedPaused[vault]) revert NavOracle__FeedPaused(vault);

        NavAttestation storage prev = _vaultNav[vault];

        // Deviation guard: applies from the second publish onward, unless the
        // Sentinel issued a one-shot waiver after reviewing an anomaly.
        if (prev.updatedAt != 0 && prev.nav != 0 && !deviationWaiver[vault]) {
            uint256 diff = nav > prev.nav ? nav - prev.nav : prev.nav - nav;
            uint256 deviationBps = diff * MAX_BPS / prev.nav;
            if (deviationBps > maxDeviationBps) {
                vaultFeedPaused[vault] = true;
                vaultAnomalyFlagged[vault] = true;
                emit NavAnomalyDetected(vault, nav, prev.nav, deviationBps);
                emit FeedPaused(vault, msg.sender);
                return; // attestation NOT applied
            }
        }
        // Consume the waiver if one was granted.
        if (deviationWaiver[vault]) deviationWaiver[vault] = false;

        _vaultNav[vault] = NavAttestation({
            nav: nav,
            confidenceBps: confidenceBps,
            updatedAt: uint64(block.timestamp),
            sourceHash: sourceHash
        });

        emit NavPublished(vault, nav, confidenceBps, sourceHash);
    }

    /// @notice Publish a risk-score attestation for a portfolio (mock Braino.ai feed).
    /// @param portfolioId Portfolio id (must exist in the PortfolioRegistry)
    /// @param riskScoreBps Expected-loss/risk score, 0..10000
    /// @param confidenceBps Model confidence (>= minConfidenceBps)
    /// @param sourceHash Hash of the off-chain report
    function publishPortfolioRisk(uint256 portfolioId, uint16 riskScoreBps, uint16 confidenceBps, bytes32 sourceHash)
        external
        onlyProtocolRole(ORACLE_ROLE)
    {
        if (sourceHash == bytes32(0)) revert NavOracle__InvalidParams();
        if (riskScoreBps > MAX_BPS) revert NavOracle__ScoreOutOfBounds(riskScoreBps);
        if (confidenceBps > MAX_BPS) revert NavOracle__ScoreOutOfBounds(confidenceBps);
        if (confidenceBps < minConfidenceBps) {
            revert NavOracle__ConfidenceTooLow(confidenceBps, minConfidenceBps);
        }
        // Reverts if the portfolio does not exist.
        portfolioRegistry.getPortfolio(portfolioId);

        _portfolioRisk[portfolioId] = RiskAttestation({
            riskScoreBps: riskScoreBps,
            confidenceBps: confidenceBps,
            updatedAt: uint64(block.timestamp),
            sourceHash: sourceHash
        });

        emit PortfolioRiskPublished(portfolioId, riskScoreBps, confidenceBps, sourceHash);
    }

    // --- Sentinel Anomaly Response (SENTINEL_ROLE) ---

    /// @notice Pause a vault NAV feed (risk action).
    function pauseFeed(address vault) external onlyProtocolRole(SENTINEL_ROLE) {
        if (vault == address(0)) revert NavOracle__InvalidParams();
        vaultFeedPaused[vault] = true;
        emit FeedPaused(vault, msg.sender);
    }

    /// @notice Unpause a vault NAV feed after review. Clears the anomaly latch.
    function unpauseFeed(address vault) external onlyProtocolRole(SENTINEL_ROLE) {
        if (vault == address(0)) revert NavOracle__InvalidParams();
        vaultFeedPaused[vault] = false;
        vaultAnomalyFlagged[vault] = false;
        emit FeedUnpaused(vault, msg.sender);
    }

    /// @notice Issue a one-shot deviation waiver after reviewing an anomaly:
    ///         the next publishNav skips the deviation guard once. The Sentinel
    ///         approves the exception but never supplies the data itself.
    function acknowledgeDeviation(address vault) external onlyProtocolRole(SENTINEL_ROLE) {
        if (vault == address(0)) revert NavOracle__InvalidParams();
        deviationWaiver[vault] = true;
        emit DeviationAcknowledged(vault, msg.sender);
    }

    // --- Configuration (OWNER_ROLE) ---

    /// @notice Update guard parameters within the documented hard bounds.
    function setGuards(uint64 maxStaleness_, uint256 maxDeviationBps_, uint16 minConfidenceBps_)
        external
        onlyProtocolRole(OWNER_ROLE)
    {
        if (maxStaleness_ < STALENESS_FLOOR || maxStaleness_ > STALENESS_CEILING) {
            revert NavOracle__InvalidParams();
        }
        if (maxDeviationBps_ == 0 || maxDeviationBps_ > DEVIATION_CEILING_BPS) {
            revert NavOracle__InvalidParams();
        }
        if (minConfidenceBps_ > MAX_BPS) revert NavOracle__InvalidParams();

        maxStaleness = maxStaleness_;
        maxDeviationBps = maxDeviationBps_;
        minConfidenceBps = minConfidenceBps_;
        emit GuardsUpdated(maxStaleness_, maxDeviationBps_, minConfidenceBps_);
    }

    // --- Consumer Views ---

    /// @notice Strict NAV read for protocol consumers: reverts if never published,
    ///         stale or paused. Consumers can never silently act on invalid data.
    function getNav(address vault) external view returns (uint256 nav, uint16 confidenceBps, uint64 updatedAt) {
        if (vaultFeedPaused[vault]) revert NavOracle__FeedPaused(vault);
        NavAttestation memory att = _vaultNav[vault];
        if (att.updatedAt == 0) revert NavOracle__NoAttestation(vault);
        if (uint64(block.timestamp) > att.updatedAt + maxStaleness) {
            revert NavOracle__StaleNav(vault, att.updatedAt, maxStaleness);
        }
        return (att.nav, att.confidenceBps, att.updatedAt);
    }

    /// @notice Non-reverting NAV read for frontend/indexer use.
    /// @return valid True only if an attestation exists, is fresh and the feed is live
    function tryGetNav(address vault) external view returns (bool valid, NavAttestation memory att) {
        att = _vaultNav[vault];
        valid = !vaultFeedPaused[vault]
            && att.updatedAt != 0
            && uint64(block.timestamp) <= att.updatedAt + maxStaleness;
    }

    /// @notice Strict risk-score read: reverts if never published or stale.
    function getPortfolioRisk(uint256 portfolioId)
        external
        view
        returns (uint16 riskScoreBps, uint16 confidenceBps, uint64 updatedAt)
    {
        RiskAttestation memory att = _portfolioRisk[portfolioId];
        if (att.updatedAt == 0) revert NavOracle__NoRiskAttestation(portfolioId);
        if (uint64(block.timestamp) > att.updatedAt + maxStaleness) {
            revert NavOracle__StaleRisk(portfolioId, att.updatedAt, maxStaleness);
        }
        return (att.riskScoreBps, att.confidenceBps, att.updatedAt);
    }

    /// @notice Non-reverting risk read for frontend/indexer use.
    function tryGetPortfolioRisk(uint256 portfolioId)
        external
        view
        returns (bool valid, RiskAttestation memory att)
    {
        att = _portfolioRisk[portfolioId];
        valid = att.updatedAt != 0 && uint64(block.timestamp) <= att.updatedAt + maxStaleness;
    }

    /// @notice Raw attestation access (no guards) for diagnostics/audit tooling.
    function rawNavAttestation(address vault) external view returns (NavAttestation memory) {
        return _vaultNav[vault];
    }
}
