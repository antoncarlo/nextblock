// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";
import {InsuranceVault} from "./InsuranceVault.sol";
import {AIAssessor} from "./AIAssessor.sol";
import {ClaimReceipt} from "./ClaimReceipt.sol";

/// @title ClaimManager
/// @author Anton Carlo Santoro
/// @notice Canonical source of claim state for the NextBlock protocol.
///
///         SECURITY HIERARCHY (institutional separation of powers):
///         1. ClaimManager  — owns the claim lifecycle and audit trail.
///         2. AIAssessor    — ADVISORY mock only: it can signal, score and
///                            classify; it can NEVER approve or trigger payouts.
///         3. Claims Committee (CLAIMS_COMMITTEE_ROLE) — the ONLY authority that
///                            approves or rejects claims. Non-parametric claims
///                            additionally require an AI assessment on file AND
///                            an elapsed dispute window.
///         4. Sentinel      — can dispute and freeze anomalous claims; cannot
///                            approve and cannot move funds.
///         5. InsuranceVault — sole payout executor: reserves and pays under its
///                            own solvency, buffer and UPR accounting.
///
///         This contract holds NO USDC and performs NO direct transfers: every
///         flow of funds goes through the vault's gated claim path.
contract ClaimManager is ProtocolRoleConstants, ReentrancyGuard {
    // --- Constants (documented; no magic numbers) ---
    /// @notice Default dispute window for non-parametric claims: 3 days.
    uint64 public constant DEFAULT_DISPUTE_WINDOW = 3 days;

    /// @notice The dispute window can never be configured below 24 hours.
    uint64 public constant DISPUTE_WINDOW_FLOOR = 1 days;

    /// @notice Upper bound for the dispute window configuration.
    uint64 public constant DISPUTE_WINDOW_CEILING = 30 days;

    // --- Enums / Structs ---
    /// @notice PARAMETRIC claims rest on objective triggers and may skip the
    ///         dispute window (still committee-approved; explicitly limited path
    ///         pending the BordereauOracle). NON_PARAMETRIC claims require the
    ///         full AI-gate + dispute-window + committee path.
    enum ClaimType {
        NON_PARAMETRIC, // 0: default institutional path
        PARAMETRIC // 1: objective-trigger path (limited)
    }

    enum ClaimStatus {
        SUBMITTED, // 0
        ASSESSED, // 1: AI advisory assessment attached
        DISPUTED, // 2: sentinel dispute pending committee resolution
        APPROVED, // 3: committee approved; reserve taken in the vault
        PAID, // 4: paid out by the vault
        REJECTED // 5: terminal rejection
    }

    struct Claim {
        uint256 claimId;
        uint256 portfolioId;
        address vault;
        address claimant; // the portfolio's cedant
        uint256 requestedAmount; // USDC 6 decimals
        uint256 approvedAmount; // set by the committee (<= requested)
        ClaimType claimType;
        ClaimStatus status;
        bytes32 evidenceHash; // off-chain evidence bundle anchor
        uint64 submittedAt;
        uint64 challengeDeadline; // submittedAt + disputeWindow
        bool frozen; // sentinel operational freeze / anomaly latch
        uint256 receiptId; // ClaimReceipt minted at approval
    }

    // --- State ---
    ProtocolRoles public immutable protocolRoles;
    PortfolioRegistry public immutable portfolioRegistry;
    AIAssessor public immutable aiAssessor;
    ClaimReceipt public immutable claimReceipt;

    uint64 public disputeWindow;

    uint256 public nextClaimId;
    mapping(uint256 => Claim) private _claims;

    // --- Events ---
    event ClaimSubmitted(
        uint256 indexed claimId,
        uint256 indexed portfolioId,
        address indexed vault,
        address claimant,
        uint256 requestedAmount,
        ClaimType claimType,
        bytes32 evidenceHash,
        uint64 challengeDeadline
    );
    event ClaimAssessed(
        uint256 indexed claimId,
        AIAssessor.Recommendation recommendation,
        uint16 scoreBps,
        uint16 anomalyScoreBps,
        bytes32 sourceHash
    );
    event ClaimAnomalyFlagged(uint256 indexed claimId, uint16 anomalyScoreBps);
    event ClaimDisputed(uint256 indexed claimId, address indexed sentinel, string reason);
    event ClaimDisputeResolved(uint256 indexed claimId, address indexed committee, bool upheld);
    event ClaimFrozen(uint256 indexed claimId, address indexed sentinel);
    event ClaimUnfrozen(uint256 indexed claimId, address indexed sentinel);
    event ClaimApproved(uint256 indexed claimId, address indexed committee, uint256 approvedAmount, uint256 receiptId);
    event ClaimRejected(uint256 indexed claimId, address indexed committee, string reason);
    event ClaimPaid(uint256 indexed claimId, address indexed to, uint256 amount, uint256 receiptId);
    event DisputeWindowUpdated(uint64 window);

    // --- Errors ---
    error ClaimManager__UnauthorizedRole(address caller, bytes32 role);
    error ClaimManager__InvalidParams();
    error ClaimManager__ClaimNotFound(uint256 claimId);
    error ClaimManager__InvalidStatus(uint256 claimId, ClaimStatus status);
    error ClaimManager__NotPortfolioCedant(uint256 portfolioId, address caller);
    error ClaimManager__PortfolioNotClaimable(uint256 portfolioId);
    error ClaimManager__AmountExceedsCoverage(uint256 requested, uint256 coverageLimit);
    error ClaimManager__AssessmentMissing(uint256 claimId);
    error ClaimManager__DisputeWindowActive(uint256 claimId, uint64 challengeDeadline);
    error ClaimManager__ClaimFrozenError(uint256 claimId);
    error ClaimManager__ApprovedAmountInvalid(uint256 approvedAmount, uint256 requestedAmount);

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert ClaimManager__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(address protocolRoles_, address portfolioRegistry_, address aiAssessor_, address claimReceipt_) {
        if (
            protocolRoles_ == address(0) || portfolioRegistry_ == address(0) || aiAssessor_ == address(0)
                || claimReceipt_ == address(0)
        ) {
            revert ClaimManager__InvalidParams();
        }
        protocolRoles = ProtocolRoles(protocolRoles_);
        portfolioRegistry = PortfolioRegistry(portfolioRegistry_);
        aiAssessor = AIAssessor(aiAssessor_);
        claimReceipt = ClaimReceipt(claimReceipt_);

        disputeWindow = DEFAULT_DISPUTE_WINDOW;
        emit DisputeWindowUpdated(DEFAULT_DISPUTE_WINDOW);
    }

    // --- Configuration (OWNER_ROLE) ---

    /// @notice Update the dispute window within [24h, 30d]. The floor is a hard
    ///         protocol guarantee: non-parametric claims always remain challengeable.
    function setDisputeWindow(uint64 window) external onlyProtocolRole(OWNER_ROLE) {
        if (window < DISPUTE_WINDOW_FLOOR || window > DISPUTE_WINDOW_CEILING) {
            revert ClaimManager__InvalidParams();
        }
        disputeWindow = window;
        emit DisputeWindowUpdated(window);
    }

    // --- Cedant: Submission ---

    /// @notice Submit a claim against a portfolio. Only the portfolio's cedant
    ///         (holding AUTHORIZED_CEDANT_ROLE). The portfolio must be on risk or
    ///         recently expired (losses occurred during coverage).
    function submitClaim(address vault, uint256 portfolioId, uint256 amount, ClaimType claimType, bytes32 evidenceHash)
        external
        onlyProtocolRole(AUTHORIZED_CEDANT_ROLE)
        returns (uint256 claimId)
    {
        if (vault == address(0) || amount == 0 || evidenceHash == bytes32(0)) {
            revert ClaimManager__InvalidParams();
        }

        PortfolioRegistry.Portfolio memory pf = portfolioRegistry.getPortfolio(portfolioId);
        if (pf.cedant != msg.sender) revert ClaimManager__NotPortfolioCedant(portfolioId, msg.sender);
        if (
            pf.status != PortfolioRegistry.PortfolioStatus.ACTIVE
                && pf.status != PortfolioRegistry.PortfolioStatus.PAUSED
                && pf.status != PortfolioRegistry.PortfolioStatus.EXPIRED
        ) {
            revert ClaimManager__PortfolioNotClaimable(portfolioId);
        }
        if (amount > pf.coverageLimit) {
            revert ClaimManager__AmountExceedsCoverage(amount, pf.coverageLimit);
        }

        claimId = nextClaimId++;
        uint64 nowTs = uint64(block.timestamp);
        uint64 deadline = nowTs + disputeWindow;

        _claims[claimId] = Claim({
            claimId: claimId,
            portfolioId: portfolioId,
            vault: vault,
            claimant: msg.sender,
            requestedAmount: amount,
            approvedAmount: 0,
            claimType: claimType,
            status: ClaimStatus.SUBMITTED,
            evidenceHash: evidenceHash,
            submittedAt: nowTs,
            challengeDeadline: deadline,
            frozen: false,
            receiptId: 0
        });

        emit ClaimSubmitted(claimId, portfolioId, vault, msg.sender, amount, claimType, evidenceHash, deadline);
    }

    // --- AI Advisory Attachment (permissionless read of the assessor store) ---

    /// @notice Attach the published AI assessment to a submitted claim.
    ///         Permissionless: it only mirrors AIAssessor data into the lifecycle.
    ///         An anomalous assessment auto-freezes the claim (Sentinel unfreezes
    ///         after review). The assessment NEVER approves or pays anything.
    function attachAssessment(uint256 claimId) external {
        Claim storage c = _getClaim(claimId);
        if (c.status != ClaimStatus.SUBMITTED) revert ClaimManager__InvalidStatus(claimId, c.status);
        if (!aiAssessor.hasAssessment(claimId)) revert ClaimManager__AssessmentMissing(claimId);

        AIAssessor.Assessment memory a = aiAssessor.getAssessment(claimId);
        c.status = ClaimStatus.ASSESSED;

        emit ClaimAssessed(claimId, a.recommendation, a.scoreBps, a.anomalyScoreBps, a.sourceHash);

        if (aiAssessor.isAnomalous(claimId)) {
            c.frozen = true;
            emit ClaimAnomalyFlagged(claimId, a.anomalyScoreBps);
            emit ClaimFrozen(claimId, address(this));
        }
    }

    // --- Sentinel: Dispute & Freeze (risk powers only; no funds) ---

    /// @notice Open a dispute on a pending claim. Only SENTINEL_ROLE.
    function disputeClaim(uint256 claimId, string calldata reason) external onlyProtocolRole(SENTINEL_ROLE) {
        Claim storage c = _getClaim(claimId);
        if (c.status != ClaimStatus.SUBMITTED && c.status != ClaimStatus.ASSESSED) {
            revert ClaimManager__InvalidStatus(claimId, c.status);
        }
        c.status = ClaimStatus.DISPUTED;
        c.frozen = true;
        emit ClaimDisputed(claimId, msg.sender, reason);
    }

    /// @notice Operational freeze without a formal dispute. Only SENTINEL_ROLE.
    function freezeClaim(uint256 claimId) external onlyProtocolRole(SENTINEL_ROLE) {
        Claim storage c = _getClaim(claimId);
        if (c.status == ClaimStatus.PAID || c.status == ClaimStatus.REJECTED) {
            revert ClaimManager__InvalidStatus(claimId, c.status);
        }
        c.frozen = true;
        emit ClaimFrozen(claimId, msg.sender);
    }

    /// @notice Lift a freeze after review. Only SENTINEL_ROLE. Does not resolve
    ///         a formal dispute (that belongs to the committee).
    function unfreezeClaim(uint256 claimId) external onlyProtocolRole(SENTINEL_ROLE) {
        Claim storage c = _getClaim(claimId);
        if (c.status == ClaimStatus.DISPUTED) revert ClaimManager__InvalidStatus(claimId, c.status);
        c.frozen = false;
        emit ClaimUnfrozen(claimId, msg.sender);
    }

    // --- Claims Committee: the ONLY approval authority ---

    /// @notice Resolve a sentinel dispute. Only CLAIMS_COMMITTEE_ROLE.
    /// @param uphold True rejects the claim; false returns it to ASSESSED (unfrozen).
    function resolveDispute(uint256 claimId, bool uphold) external onlyProtocolRole(CLAIMS_COMMITTEE_ROLE) {
        Claim storage c = _getClaim(claimId);
        if (c.status != ClaimStatus.DISPUTED) revert ClaimManager__InvalidStatus(claimId, c.status);

        if (uphold) {
            c.status = ClaimStatus.REJECTED;
        } else {
            c.status = ClaimStatus.ASSESSED;
            c.frozen = false;
        }
        emit ClaimDisputeResolved(claimId, msg.sender, uphold);
    }

    /// @notice Approve a claim and reserve funds in the vault.
    ///         NON_PARAMETRIC: requires an AI assessment on file (AI gate) AND an
    ///         elapsed dispute window AND no freeze.
    ///         PARAMETRIC: limited objective-trigger path; window may be skipped
    ///         but committee approval and freeze checks still apply.
    ///         The vault's reservePortfolioClaim enforces solvency (insolvency guard).
    function approveClaim(uint256 claimId, uint256 approvedAmount) external onlyProtocolRole(CLAIMS_COMMITTEE_ROLE) {
        Claim storage c = _getClaim(claimId);
        if (c.frozen) revert ClaimManager__ClaimFrozenError(claimId);
        if (approvedAmount == 0 || approvedAmount > c.requestedAmount) {
            revert ClaimManager__ApprovedAmountInvalid(approvedAmount, c.requestedAmount);
        }

        if (c.claimType == ClaimType.NON_PARAMETRIC) {
            // AI gate: advisory assessment must be on file (committee judges it).
            if (c.status != ClaimStatus.ASSESSED) revert ClaimManager__InvalidStatus(claimId, c.status);
            // Liveness: the claim must have remained challengeable for the full window.
            if (uint64(block.timestamp) <= c.challengeDeadline) {
                revert ClaimManager__DisputeWindowActive(claimId, c.challengeDeadline);
            }
        } else {
            // PARAMETRIC: limited path — SUBMITTED or ASSESSED, no window required.
            if (c.status != ClaimStatus.SUBMITTED && c.status != ClaimStatus.ASSESSED) {
                revert ClaimManager__InvalidStatus(claimId, c.status);
            }
        }

        c.status = ClaimStatus.APPROVED;
        c.approvedAmount = approvedAmount;

        // Vault enforces solvency: reverts if the reserve is not fully backed.
        InsuranceVault(c.vault).reservePortfolioClaim(claimId, c.portfolioId, approvedAmount);

        // Mint the soulbound receipt to the claimant (live until payout).
        // NOTE: the receipt's `vault` field is the ISSUER authorized to mark it
        // exercised (ClaimReceipt semantics); the paying vault is recorded in the
        // Claim struct and in the events.
        uint256 receiptId = claimReceipt.mint(c.claimant, c.portfolioId, approvedAmount, address(this));
        c.receiptId = receiptId;

        emit ClaimApproved(claimId, msg.sender, approvedAmount, receiptId);
    }

    /// @notice Reject a claim. Only CLAIMS_COMMITTEE_ROLE. If the claim had been
    ///         approved, the vault reserve is released back to the buffer.
    function rejectClaim(uint256 claimId, string calldata reason) external onlyProtocolRole(CLAIMS_COMMITTEE_ROLE) {
        Claim storage c = _getClaim(claimId);
        if (c.status == ClaimStatus.PAID || c.status == ClaimStatus.REJECTED) {
            revert ClaimManager__InvalidStatus(claimId, c.status);
        }

        if (c.status == ClaimStatus.APPROVED) {
            InsuranceVault(c.vault).releasePortfolioClaimReserve(claimId, c.portfolioId, c.approvedAmount);
            c.approvedAmount = 0;
        }

        c.status = ClaimStatus.REJECTED;
        emit ClaimRejected(claimId, msg.sender, reason);
    }

    // --- Settlement (permissionless once approved; vault executes) ---

    /// @notice Execute an approved claim: the VAULT pays the claimant from the
    ///         standing reserve. Permissionless: all authority checks already
    ///         happened (committee approval); a freeze still blocks execution.
    function executeClaim(uint256 claimId) external nonReentrant {
        Claim storage c = _getClaim(claimId);
        if (c.status != ClaimStatus.APPROVED) revert ClaimManager__InvalidStatus(claimId, c.status);
        if (c.frozen) revert ClaimManager__ClaimFrozenError(claimId);

        // SECURITY: status flips BEFORE the external payout call (CEI),
        // making double payout impossible.
        c.status = ClaimStatus.PAID;

        InsuranceVault(c.vault).payPortfolioClaim(claimId, c.portfolioId, c.claimant, c.approvedAmount);

        // Burn the receipt (marks it exercised).
        claimReceipt.markExercised(c.receiptId);

        emit ClaimPaid(claimId, c.claimant, c.approvedAmount, c.receiptId);
    }

    // --- Views ---

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        Claim memory c = _claims[claimId];
        if (c.claimant == address(0)) revert ClaimManager__ClaimNotFound(claimId);
        return c;
    }

    function getClaimCount() external view returns (uint256) {
        return nextClaimId;
    }

    // --- Internal ---

    function _getClaim(uint256 claimId) internal view returns (Claim storage c) {
        c = _claims[claimId];
        if (c.claimant == address(0)) revert ClaimManager__ClaimNotFound(claimId);
    }
}
