// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";

/// @title BordereauOracle
/// @author Anton Carlo Santoro
/// @notice UMA-style optimistic attestation layer for bordereau data: premium
///         bordereaux, policy bordereaux and claims bordereaux declared by
///         cedants are proposed, may be disputed during a mandatory liveness
///         window, and finalize only after surviving it (or after explicit
///         committee resolution).
///
///         HARD BOUNDARIES (no parallel source of truth):
///         - This contract holds NO funds and posts NO bonds (mock of the UMA
///           bonding mechanism, documented for the MVP).
///         - Finalization has NO economic effect: it never authorizes payouts,
///           premium splits or allocations. Economic effects live exclusively
///           in PremiumDistributor, ClaimManager, InsuranceVault and
///           VaultAllocator. This oracle only makes bordereau data VERIFIABLE
///           for the UI and for future modules.
///         - The Sentinel can flag (dispute) within the window but resolution is
///           a separate power: only the Claims Committee resolves disputes.
contract BordereauOracle is ProtocolRoleConstants {
    // --- Constants (documented; no magic numbers) ---
    /// @notice Default liveness window: 2 days.
    uint64 public constant DEFAULT_LIVENESS = 2 days;

    /// @notice Hard bounds for the liveness configuration.
    uint64 public constant LIVENESS_FLOOR = 1 hours;
    uint64 public constant LIVENESS_CEILING = 30 days;

    // --- Enums / Structs ---
    enum AssertionType {
        PREMIUM_BORDEREAU, // 0: declared premium totals for a period
        POLICY_BORDEREAU, // 1: declared policy schedule
        CLAIMS_BORDEREAU, // 2: declared loss/claims data
        OTHER // 3: other attested datasets
    }

    enum AssertionStatus {
        PROPOSED, // 0: pending liveness
        DISPUTED, // 1: sentinel challenge pending committee resolution
        FINALIZED, // 2: survived liveness or committee-verified
        REJECTED // 3: terminal rejection
    }

    struct Assertion {
        uint256 assertionId;
        uint256 portfolioId;
        AssertionType assertionType;
        bytes32 dataHash; // hash of the off-chain bordereau dataset
        string dataURI; // pointer (IPFS/document store)
        uint256 declaredAmount; // headline figure declared (USDC 6 decimals)
        address proposer;
        address disputer; // sentinel that disputed (if any)
        uint64 proposedAt;
        uint64 livenessDeadline;
        AssertionStatus status;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice Institutional portfolio registry (asserted ids must exist).
    PortfolioRegistry public immutable portfolioRegistry;

    uint64 public liveness;

    uint256 public nextAssertionId;
    mapping(uint256 => Assertion) private _assertions;

    /// @notice Latest FINALIZED assertion per portfolio and type (UI/read-model).
    mapping(uint256 => mapping(AssertionType => uint256)) private _latestFinalized;
    mapping(uint256 => mapping(AssertionType => bool)) private _hasFinalized;

    // --- Events ---
    event AssertionProposed(
        uint256 indexed assertionId,
        uint256 indexed portfolioId,
        AssertionType assertionType,
        bytes32 dataHash,
        uint256 declaredAmount,
        address proposer,
        uint64 livenessDeadline
    );
    event AssertionDisputed(uint256 indexed assertionId, address indexed sentinel, string reason);
    event AssertionDisputeResolved(uint256 indexed assertionId, address indexed committee, bool upheld);
    event AssertionFinalized(uint256 indexed assertionId, uint256 indexed portfolioId, AssertionType assertionType);
    event AssertionRejected(uint256 indexed assertionId);
    event LivenessUpdated(uint64 liveness);

    // --- Errors ---
    error BordereauOracle__UnauthorizedRole(address caller, bytes32 role);
    error BordereauOracle__UnauthorizedProposer(address caller);
    error BordereauOracle__InvalidParams();
    error BordereauOracle__AssertionNotFound(uint256 assertionId);
    error BordereauOracle__InvalidStatus(uint256 assertionId, AssertionStatus status);
    error BordereauOracle__LivenessActive(uint256 assertionId, uint64 livenessDeadline);
    error BordereauOracle__LivenessElapsed(uint256 assertionId, uint64 livenessDeadline);
    error BordereauOracle__NoFinalizedAssertion(uint256 portfolioId, AssertionType assertionType);

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert BordereauOracle__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(address protocolRoles_, address portfolioRegistry_) {
        if (protocolRoles_ == address(0) || portfolioRegistry_ == address(0)) {
            revert BordereauOracle__InvalidParams();
        }
        protocolRoles = ProtocolRoles(protocolRoles_);
        portfolioRegistry = PortfolioRegistry(portfolioRegistry_);

        liveness = DEFAULT_LIVENESS;
        emit LivenessUpdated(DEFAULT_LIVENESS);
    }

    // --- Configuration (OWNER_ROLE) ---

    /// @notice Update the liveness window within the documented bounds.
    function setLiveness(uint64 liveness_) external onlyProtocolRole(OWNER_ROLE) {
        if (liveness_ < LIVENESS_FLOOR || liveness_ > LIVENESS_CEILING) {
            revert BordereauOracle__InvalidParams();
        }
        liveness = liveness_;
        emit LivenessUpdated(liveness_);
    }

    // --- Proposal (cedant or oracle feed) ---

    /// @notice Propose a bordereau assertion. Caller must hold
    ///         AUTHORIZED_CEDANT_ROLE or ORACLE_ROLE.
    function proposeAssertion(
        uint256 portfolioId,
        AssertionType assertionType,
        bytes32 dataHash,
        string calldata dataURI,
        uint256 declaredAmount
    ) external returns (uint256 assertionId) {
        if (
            !protocolRoles.hasRole(AUTHORIZED_CEDANT_ROLE, msg.sender)
                && !protocolRoles.hasRole(ORACLE_ROLE, msg.sender)
        ) {
            revert BordereauOracle__UnauthorizedProposer(msg.sender);
        }
        if (dataHash == bytes32(0)) revert BordereauOracle__InvalidParams();
        // Reverts if the portfolio does not exist.
        portfolioRegistry.getPortfolio(portfolioId);

        assertionId = nextAssertionId++;
        uint64 nowTs = uint64(block.timestamp);
        uint64 deadline = nowTs + liveness;

        _assertions[assertionId] = Assertion({
            assertionId: assertionId,
            portfolioId: portfolioId,
            assertionType: assertionType,
            dataHash: dataHash,
            dataURI: dataURI,
            declaredAmount: declaredAmount,
            proposer: msg.sender,
            disputer: address(0),
            proposedAt: nowTs,
            livenessDeadline: deadline,
            status: AssertionStatus.PROPOSED
        });

        emit AssertionProposed(assertionId, portfolioId, assertionType, dataHash, declaredAmount, msg.sender, deadline);
    }

    // --- Dispute (Sentinel flags; Committee resolves — separate powers) ---

    /// @notice Dispute a proposed assertion within its liveness window.
    ///         Only SENTINEL_ROLE (anomaly/risk flagging power).
    function disputeAssertion(uint256 assertionId, string calldata reason) external onlyProtocolRole(SENTINEL_ROLE) {
        Assertion storage a = _getAssertion(assertionId);
        if (a.status != AssertionStatus.PROPOSED) {
            revert BordereauOracle__InvalidStatus(assertionId, a.status);
        }
        if (uint64(block.timestamp) > a.livenessDeadline) {
            revert BordereauOracle__LivenessElapsed(assertionId, a.livenessDeadline);
        }

        a.status = AssertionStatus.DISPUTED;
        a.disputer = msg.sender;
        emit AssertionDisputed(assertionId, msg.sender, reason);
    }

    /// @notice Resolve a dispute. Only CLAIMS_COMMITTEE_ROLE (resolution is a
    ///         separate power from the Sentinel's flagging).
    /// @param uphold True rejects the assertion; false verifies and finalizes it.
    function resolveDispute(uint256 assertionId, bool uphold) external onlyProtocolRole(CLAIMS_COMMITTEE_ROLE) {
        Assertion storage a = _getAssertion(assertionId);
        if (a.status != AssertionStatus.DISPUTED) {
            revert BordereauOracle__InvalidStatus(assertionId, a.status);
        }

        if (uphold) {
            a.status = AssertionStatus.REJECTED;
            emit AssertionRejected(assertionId);
        } else {
            _finalize(a);
        }
        emit AssertionDisputeResolved(assertionId, msg.sender, uphold);
    }

    // --- Finalization (permissionless after liveness) ---

    /// @notice Finalize an assertion that survived its liveness window.
    ///         Permissionless housekeeping; NO economic effect.
    function finalizeAssertion(uint256 assertionId) external {
        Assertion storage a = _getAssertion(assertionId);
        if (a.status != AssertionStatus.PROPOSED) {
            revert BordereauOracle__InvalidStatus(assertionId, a.status);
        }
        if (uint64(block.timestamp) <= a.livenessDeadline) {
            revert BordereauOracle__LivenessActive(assertionId, a.livenessDeadline);
        }
        _finalize(a);
    }

    // --- Views ---

    function getAssertion(uint256 assertionId) external view returns (Assertion memory) {
        Assertion memory a = _assertions[assertionId];
        if (a.proposer == address(0)) revert BordereauOracle__AssertionNotFound(assertionId);
        return a;
    }

    function getAssertionCount() external view returns (uint256) {
        return nextAssertionId;
    }

    function isFinalized(uint256 assertionId) external view returns (bool) {
        return _assertions[assertionId].status == AssertionStatus.FINALIZED;
    }

    /// @notice Latest finalized assertion for a portfolio/type. Reverts if none:
    ///         consumers must treat unverified bordereau data as absent.
    function latestFinalized(uint256 portfolioId, AssertionType assertionType)
        external
        view
        returns (Assertion memory)
    {
        if (!_hasFinalized[portfolioId][assertionType]) {
            revert BordereauOracle__NoFinalizedAssertion(portfolioId, assertionType);
        }
        return _assertions[_latestFinalized[portfolioId][assertionType]];
    }

    // --- Internal ---

    function _finalize(Assertion storage a) internal {
        a.status = AssertionStatus.FINALIZED;
        _latestFinalized[a.portfolioId][a.assertionType] = a.assertionId;
        _hasFinalized[a.portfolioId][a.assertionType] = true;
        emit AssertionFinalized(a.assertionId, a.portfolioId, a.assertionType);
    }

    function _getAssertion(uint256 assertionId) internal view returns (Assertion storage a) {
        a = _assertions[assertionId];
        if (a.proposer == address(0)) revert BordereauOracle__AssertionNotFound(assertionId);
    }
}
