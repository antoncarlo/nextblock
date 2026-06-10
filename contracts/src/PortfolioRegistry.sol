// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title PortfolioRegistry
/// @author Anton Carlo Santoro
/// @notice Institutional registry of ceded reinsurance portfolios/treaties as RWA
///         references. Cedants submit portfolios, Underwriting Curators review,
///         approve, reject and activate them; Sentinels can pause active portfolios.
///         Holds NO funds: pure audit trail + metadata anchor for off-chain documents
///         (term sheets, bordereaux, cession agreements).
/// @dev Lifecycle: SUBMITTED -> UNDER_REVIEW -> APPROVED -> ACTIVE -> (PAUSED <-> ACTIVE)
///      -> EXPIRED; SUBMITTED/UNDER_REVIEW -> REJECTED. Transitions are closed:
///      no other path is possible. Access control via the central ProtocolRoles manager.
contract PortfolioRegistry is ProtocolRoleConstants {
    // --- Constants ---
    /// @notice Basis-points denominator used for expectedLossBps bounds (100% = 10_000).
    uint256 public constant MAX_BPS = 10_000;

    // --- Enums ---
    /// @notice Reinsurance structure of the ceded portfolio/treaty.
    enum StructureType {
        QUOTA_SHARE, // 0: proportional quota share
        XOL, // 1: excess of loss
        SURPLUS, // 2: surplus share
        PARAMETRIC, // 3: parametric trigger
        OTHER // 4: other/bespoke structure
    }

    /// @notice Institutional portfolio lifecycle status.
    enum PortfolioStatus {
        SUBMITTED, // 0: submitted by cedant, awaiting review
        UNDER_REVIEW, // 1: Underwriting Curator reviewing / AI assessment in progress
        APPROVED, // 2: approved by Underwriting Curator, not yet on risk
        ACTIVE, // 3: on risk, allocatable by vaults
        PAUSED, // 4: paused by Sentinel (risk action)
        EXPIRED, // 5: coverage period elapsed
        REJECTED // 6: rejected during review
    }

    // --- Structs ---
    struct Portfolio {
        uint256 portfolioId;
        address cedant; // submitting cedant / reinsurer
        string name; // display name (e.g., "EU Property CAT QS 2026")
        string metadataURI; // IPFS / document store pointer
        bytes32 documentHash; // hash of the off-chain documentation bundle
        string lineOfBusiness; // e.g., "Property CAT", "Marine", "D&O"
        string jurisdiction; // e.g., "EU", "BS", "UK"
        StructureType structureType;
        uint256 coverageLimit; // ceded coverage limit, USDC 6 decimals
        uint256 cededPremium; // expected ceded premium, USDC 6 decimals
        uint16 expectedLossBps; // Braino.ai risk score mock, set at approval (<= MAX_BPS)
        uint64 inceptionTime; // coverage inception (unix)
        uint64 expiryTime; // coverage expiry (unix)
        PortfolioStatus status;
        uint64 submittedAt;
        uint64 updatedAt;
    }

    /// @notice Cedant-supplied submission parameters (packed to keep stack shallow).
    struct SubmissionParams {
        string name;
        string metadataURI;
        bytes32 documentHash;
        string lineOfBusiness;
        string jurisdiction;
        StructureType structureType;
        uint256 coverageLimit;
        uint256 cededPremium;
        uint64 inceptionTime;
        uint64 expiryTime;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    uint256 public nextPortfolioId;
    mapping(uint256 => Portfolio) private _portfolios;
    mapping(address => uint256[]) private _portfoliosByCedant;

    // --- Events ---
    event PortfolioSubmitted(
        uint256 indexed portfolioId,
        address indexed cedant,
        StructureType structureType,
        uint256 coverageLimit,
        uint256 cededPremium,
        uint64 inceptionTime,
        uint64 expiryTime
    );
    event PortfolioReviewStarted(uint256 indexed portfolioId, address indexed curator);
    event PortfolioApproved(uint256 indexed portfolioId, address indexed curator, uint16 expectedLossBps);
    event PortfolioRejected(uint256 indexed portfolioId, address indexed curator, string reason);
    event PortfolioActivated(uint256 indexed portfolioId, address indexed curator);
    event PortfolioPaused(uint256 indexed portfolioId, address indexed sentinel);
    event PortfolioUnpaused(uint256 indexed portfolioId, address indexed sentinel);
    event PortfolioExpired(uint256 indexed portfolioId);
    event PortfolioMetadataUpdated(uint256 indexed portfolioId, string metadataURI, bytes32 documentHash);

    // --- Errors ---
    error PortfolioRegistry__NotFound(uint256 portfolioId);
    error PortfolioRegistry__InvalidStatus(uint256 portfolioId, PortfolioStatus current);
    error PortfolioRegistry__InvalidParams();
    error PortfolioRegistry__UnauthorizedRole(address caller, bytes32 role);
    error PortfolioRegistry__NotCedantOfPortfolio(uint256 portfolioId, address caller);
    error PortfolioRegistry__NotYetExpired(uint256 portfolioId, uint64 expiryTime);
    error PortfolioRegistry__InvalidLossBps(uint16 expectedLossBps);

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert PortfolioRegistry__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    /// @param protocolRoles_ Address of the deployed ProtocolRoles access manager.
    constructor(address protocolRoles_) {
        if (protocolRoles_ == address(0)) revert PortfolioRegistry__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
    }

    // --- Cedant Actions ---

    /// @notice Submit a ceded portfolio/treaty for underwriting review.
    ///         Only AUTHORIZED_CEDANT_ROLE; msg.sender becomes the portfolio cedant.
    /// @param p Submission parameters (see SubmissionParams).
    /// @return portfolioId The id of the newly submitted portfolio.
    function submitPortfolio(SubmissionParams calldata p)
        external
        onlyProtocolRole(AUTHORIZED_CEDANT_ROLE)
        returns (uint256 portfolioId)
    {
        if (
            p.coverageLimit == 0 || p.cededPremium == 0 || p.expiryTime <= p.inceptionTime
                || p.documentHash == bytes32(0) || bytes(p.name).length == 0
        ) {
            revert PortfolioRegistry__InvalidParams();
        }

        portfolioId = nextPortfolioId++;
        uint64 nowTs = uint64(block.timestamp);

        _portfolios[portfolioId] = Portfolio({
            portfolioId: portfolioId,
            cedant: msg.sender,
            name: p.name,
            metadataURI: p.metadataURI,
            documentHash: p.documentHash,
            lineOfBusiness: p.lineOfBusiness,
            jurisdiction: p.jurisdiction,
            structureType: p.structureType,
            coverageLimit: p.coverageLimit,
            cededPremium: p.cededPremium,
            expectedLossBps: 0, // set by Underwriting Curator at approval (Braino.ai mock)
            inceptionTime: p.inceptionTime,
            expiryTime: p.expiryTime,
            status: PortfolioStatus.SUBMITTED,
            submittedAt: nowTs,
            updatedAt: nowTs
        });
        _portfoliosByCedant[msg.sender].push(portfolioId);

        emit PortfolioSubmitted(
            portfolioId, msg.sender, p.structureType, p.coverageLimit, p.cededPremium, p.inceptionTime, p.expiryTime
        );
    }

    /// @notice Update metadata pointer/hash. Only the submitting cedant, and only
    ///         while the portfolio is still SUBMITTED or UNDER_REVIEW (immutable
    ///         after approval for audit-trail integrity).
    function updateMetadata(uint256 portfolioId, string calldata metadataURI, bytes32 documentHash)
        external
        onlyProtocolRole(AUTHORIZED_CEDANT_ROLE)
    {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.cedant != msg.sender) revert PortfolioRegistry__NotCedantOfPortfolio(portfolioId, msg.sender);
        if (pf.status != PortfolioStatus.SUBMITTED && pf.status != PortfolioStatus.UNDER_REVIEW) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        if (documentHash == bytes32(0)) revert PortfolioRegistry__InvalidParams();

        pf.metadataURI = metadataURI;
        pf.documentHash = documentHash;
        pf.updatedAt = uint64(block.timestamp);

        emit PortfolioMetadataUpdated(portfolioId, metadataURI, documentHash);
    }

    // --- Underwriting Curator Actions ---

    /// @notice Move a submitted portfolio into review. Only UNDERWRITING_CURATOR_ROLE.
    function startReview(uint256 portfolioId) external onlyProtocolRole(UNDERWRITING_CURATOR_ROLE) {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.SUBMITTED) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        pf.status = PortfolioStatus.UNDER_REVIEW;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioReviewStarted(portfolioId, msg.sender);
    }

    /// @notice Approve a portfolio under review, recording the mock Braino.ai
    ///         expected-loss score. Only UNDERWRITING_CURATOR_ROLE.
    /// @param expectedLossBps Expected loss ratio in basis points (<= MAX_BPS).
    function approvePortfolio(uint256 portfolioId, uint16 expectedLossBps)
        external
        onlyProtocolRole(UNDERWRITING_CURATOR_ROLE)
    {
        if (expectedLossBps > MAX_BPS) revert PortfolioRegistry__InvalidLossBps(expectedLossBps);
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.UNDER_REVIEW) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        pf.status = PortfolioStatus.APPROVED;
        pf.expectedLossBps = expectedLossBps;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioApproved(portfolioId, msg.sender, expectedLossBps);
    }

    /// @notice Reject a portfolio during review. Only UNDERWRITING_CURATOR_ROLE.
    /// @param reason Human-readable rejection reason (audit trail; emitted only).
    function rejectPortfolio(uint256 portfolioId, string calldata reason)
        external
        onlyProtocolRole(UNDERWRITING_CURATOR_ROLE)
    {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.SUBMITTED && pf.status != PortfolioStatus.UNDER_REVIEW) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        pf.status = PortfolioStatus.REJECTED;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioRejected(portfolioId, msg.sender, reason);
    }

    /// @notice Activate an approved portfolio (goes on risk). Only UNDERWRITING_CURATOR_ROLE.
    ///         Reverts if the coverage window has already elapsed.
    function activatePortfolio(uint256 portfolioId) external onlyProtocolRole(UNDERWRITING_CURATOR_ROLE) {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.APPROVED) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        if (uint64(block.timestamp) >= pf.expiryTime) {
            revert PortfolioRegistry__InvalidParams();
        }
        pf.status = PortfolioStatus.ACTIVE;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioActivated(portfolioId, msg.sender);
    }

    // --- Sentinel Actions ---

    /// @notice Pause an active portfolio (risk action). Only SENTINEL_ROLE.
    function pausePortfolio(uint256 portfolioId) external onlyProtocolRole(SENTINEL_ROLE) {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.ACTIVE) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        pf.status = PortfolioStatus.PAUSED;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioPaused(portfolioId, msg.sender);
    }

    /// @notice Unpause a paused portfolio. Only SENTINEL_ROLE.
    function unpausePortfolio(uint256 portfolioId) external onlyProtocolRole(SENTINEL_ROLE) {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.PAUSED) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        pf.status = PortfolioStatus.ACTIVE;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioUnpaused(portfolioId, msg.sender);
    }

    // --- Permissionless Maintenance ---

    /// @notice Mark an ACTIVE or PAUSED portfolio as EXPIRED once its coverage
    ///         window has elapsed. Permissionless (lazy, time-based).
    function markExpired(uint256 portfolioId) external {
        Portfolio storage pf = _getExisting(portfolioId);
        if (pf.status != PortfolioStatus.ACTIVE && pf.status != PortfolioStatus.PAUSED) {
            revert PortfolioRegistry__InvalidStatus(portfolioId, pf.status);
        }
        if (uint64(block.timestamp) < pf.expiryTime) {
            revert PortfolioRegistry__NotYetExpired(portfolioId, pf.expiryTime);
        }
        pf.status = PortfolioStatus.EXPIRED;
        pf.updatedAt = uint64(block.timestamp);
        emit PortfolioExpired(portfolioId);
    }

    // --- Views ---

    /// @notice Full portfolio data. Reverts if the id does not exist.
    function getPortfolio(uint256 portfolioId) external view returns (Portfolio memory) {
        Portfolio memory pf = _portfolios[portfolioId];
        if (pf.cedant == address(0)) revert PortfolioRegistry__NotFound(portfolioId);
        return pf;
    }

    /// @notice Total number of submitted portfolios.
    function getPortfolioCount() external view returns (uint256) {
        return nextPortfolioId;
    }

    /// @notice Portfolio ids submitted by a cedant.
    function getPortfoliosByCedant(address cedant) external view returns (uint256[] memory) {
        return _portfoliosByCedant[cedant];
    }

    /// @notice True if the portfolio is allocatable by vaults (APPROVED or ACTIVE).
    ///         Phase 3 vault hardening consumes this gate.
    function isAllocatable(uint256 portfolioId) external view returns (bool) {
        Portfolio memory pf = _portfolios[portfolioId];
        if (pf.cedant == address(0)) return false;
        return pf.status == PortfolioStatus.APPROVED || pf.status == PortfolioStatus.ACTIVE;
    }

    // --- Internal ---

    function _getExisting(uint256 portfolioId) internal view returns (Portfolio storage pf) {
        pf = _portfolios[portfolioId];
        if (pf.cedant == address(0)) revert PortfolioRegistry__NotFound(portfolioId);
    }
}
