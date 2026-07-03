// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";
import {InsuranceVault} from "./InsuranceVault.sol";
import {NavOracle} from "./NavOracle.sol";

/// @title VaultAllocator
/// @author Anton Carlo Santoro
/// @notice Strategy/controller layer that proposes and executes capital
///         allocations from InsuranceVaults toward APPROVED/ACTIVE portfolios.
///
///         Design boundaries (institutional role separation):
///         - Holds NO USDC and has NO transfer functions: it can only call the
///           vault's hardened allocateToPortfolio/deallocateFromPortfolio, so it
///           can never drain funds out of the protocol.
///         - The vault remains the FINAL enforcer of capacity, buffer, UPR,
///           claim reserves, coverage limits and compliance. This contract adds
///           strategy-level checks (eligibility, concentration, oracle guard)
///           on top — it never replaces vault accounting.
///         - Exposure is always read from vault.portfolioAllocation() and the
///           PortfolioRegistry: no duplicated accounting state lives here.
///         - NavOracle input is ADVISORY: a paused/anomalous feed or a stale
///           attestation blocks new allocations; a missing attestation does not
///           (the oracle is optional in the MVP). NAV never moves funds.
///         - Allocation is fully parametric: the Allocator supplies portfolios,
///           bps weights and the total via proposeSplitAllocation — there is no
///           hardcoded split. Segregation of the deployed underwriting capacity
///           is the legal SPV, not an on-chain shortcut.
contract VaultAllocator is ProtocolRoleConstants {
    // --- Constants (documented parameters; no magic numbers) ---
    /// @notice Basis-points denominator (100% = 10_000).
    uint256 public constant BASIS_POINTS = 10_000;

    /// @notice Default proposal time-to-live: 1 day.
    uint64 public constant DEFAULT_PROPOSAL_TTL = 1 days;

    /// @notice Hard bounds for the proposal TTL configuration.
    uint64 public constant PROPOSAL_TTL_FLOOR = 1 hours;
    /// @notice Hard upper bound for the proposal TTL.
    uint64 public constant PROPOSAL_TTL_CEILING = 7 days;

    /// @notice Default per-portfolio concentration limit: 40% of the vault's
    ///         investable base (underwritingCapacity + already allocated).
    uint256 public constant DEFAULT_MAX_PORTFOLIO_CONCENTRATION_BPS = 4_000;

    /// @notice Default per-cedant concentration limit: 60% of the investable base.
    uint256 public constant DEFAULT_MAX_CEDANT_CONCENTRATION_BPS = 6_000;

    // --- Enums / Structs ---
    enum ProposalStatus {
        PROPOSED, // 0: pending execution
        EXECUTED, // 1: applied on the vault
        CANCELLED, // 2: cancelled by proposer or Sentinel
        EXPIRED // 3: TTL elapsed without execution
    }

    struct AllocationProposal {
        uint256 proposalId;
        address vault;
        uint256 portfolioId;
        uint256 amount; // USDC, 6 decimals
        bool isDeallocation; // risk-reduction proposals skip oracle/concentration
        address proposer;
        uint64 proposedAt;
        uint64 expiresAt;
        ProposalStatus status;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice Institutional portfolio registry.
    PortfolioRegistry public immutable portfolioRegistry;

    /// @notice Advisory NAV oracle. address(0) disables the advisory guard
    ///         (documented MVP configuration; set via OWNER_ROLE).
    NavOracle public navOracle;

    /// @notice Current proposal time-to-live (seconds).
    uint64 public proposalTtl;
    /// @notice Per-portfolio concentration limit (bps of the investable base).
    uint256 public maxPortfolioConcentrationBps;
    /// @notice Per-cedant concentration limit (bps of the investable base).
    uint256 public maxCedantConcentrationBps;

    /// @notice Monotonic id of the next proposal.
    uint256 public nextProposalId;
    mapping(uint256 => AllocationProposal) private _proposals;

    // --- Events ---
    /// @notice Emitted when an allocation/deallocation proposal is stored.
    event AllocationProposed(
        uint256 indexed proposalId,
        address indexed vault,
        uint256 indexed portfolioId,
        uint256 amount,
        bool isDeallocation,
        address proposer,
        uint64 expiresAt
    );
    /// @notice Emitted when a proposal executes against the vault.
    event AllocationExecuted(uint256 indexed proposalId, address indexed executor);
    /// @notice Emitted when a proposal is cancelled.
    event AllocationCancelled(uint256 indexed proposalId, address indexed by);
    /// @notice Emitted when a proposal is marked expired.
    event AllocationExpired(uint256 indexed proposalId);
    /// @notice Emitted when the concentration limits change.
    event ConcentrationLimitsUpdated(uint256 maxPortfolioBps, uint256 maxCedantBps);
    /// @notice Emitted when the advisory NAV oracle is set or disabled.
    event NavOracleSet(address indexed navOracle);
    /// @notice Emitted when the proposal TTL changes.
    event ProposalTtlUpdated(uint64 ttl);

    // --- Errors ---
    /// @notice Caller lacks the required ProtocolRoles role.
    error VaultAllocator__UnauthorizedRole(address caller, bytes32 role);
    /// @notice Caller may not cancel this proposal.
    error VaultAllocator__UnauthorizedCanceller(address caller);
    /// @notice Zero address/value or otherwise malformed parameters.
    error VaultAllocator__InvalidParams();
    /// @notice No proposal under this id.
    error VaultAllocator__ProposalNotFound(uint256 proposalId);
    /// @notice Proposal is not pending.
    error VaultAllocator__ProposalNotPending(uint256 proposalId, ProposalStatus status);
    /// @notice Proposal is past its TTL.
    error VaultAllocator__ProposalExpired(uint256 proposalId, uint64 expiresAt);
    /// @notice Proposal has not expired yet.
    error VaultAllocator__ProposalNotExpired(uint256 proposalId, uint64 expiresAt);
    /// @notice Portfolio is not in an allocatable status.
    error VaultAllocator__PortfolioNotAllocatable(uint256 portfolioId);
    /// @notice Allocation would exceed the per-portfolio concentration limit.
    error VaultAllocator__PortfolioConcentrationExceeded(uint256 portfolioId, uint256 wouldBe, uint256 limit);
    /// @notice Allocation would exceed the per-cedant concentration limit.
    error VaultAllocator__CedantConcentrationExceeded(address cedant, uint256 wouldBe, uint256 limit);
    /// @notice The advisory oracle guard blocks new allocations for this vault.
    error VaultAllocator__OracleBlocked(address vault);
    /// @notice Split weights must sum to BASIS_POINTS.
    error VaultAllocator__WeightsMismatch();

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert VaultAllocator__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    /// @notice Wires roles, the portfolio registry and the optional advisory oracle.
    constructor(address protocolRoles_, address portfolioRegistry_, address navOracle_) {
        if (protocolRoles_ == address(0) || portfolioRegistry_ == address(0)) {
            revert VaultAllocator__InvalidParams();
        }
        protocolRoles = ProtocolRoles(protocolRoles_);
        portfolioRegistry = PortfolioRegistry(portfolioRegistry_);
        navOracle = NavOracle(navOracle_); // address(0) allowed: advisory guard disabled

        proposalTtl = DEFAULT_PROPOSAL_TTL;
        maxPortfolioConcentrationBps = DEFAULT_MAX_PORTFOLIO_CONCENTRATION_BPS;
        maxCedantConcentrationBps = DEFAULT_MAX_CEDANT_CONCENTRATION_BPS;

        emit ProposalTtlUpdated(DEFAULT_PROPOSAL_TTL);
        emit ConcentrationLimitsUpdated(DEFAULT_MAX_PORTFOLIO_CONCENTRATION_BPS, DEFAULT_MAX_CEDANT_CONCENTRATION_BPS);
        emit NavOracleSet(navOracle_);
    }

    // --- Configuration (OWNER_ROLE) ---

    /// @notice Update concentration limits (bps of the vault investable base).
    function setConcentrationLimits(uint256 maxPortfolioBps, uint256 maxCedantBps)
        external
        onlyProtocolRole(OWNER_ROLE)
    {
        if (maxPortfolioBps == 0 || maxPortfolioBps > BASIS_POINTS) {
            revert VaultAllocator__InvalidParams();
        }
        if (maxCedantBps == 0 || maxCedantBps > BASIS_POINTS) revert VaultAllocator__InvalidParams();
        if (maxCedantBps < maxPortfolioBps) revert VaultAllocator__InvalidParams();
        maxPortfolioConcentrationBps = maxPortfolioBps;
        maxCedantConcentrationBps = maxCedantBps;
        emit ConcentrationLimitsUpdated(maxPortfolioBps, maxCedantBps);
    }

    /// @notice Set or disable (address(0)) the advisory NAV oracle.
    function setNavOracle(address navOracle_) external onlyProtocolRole(OWNER_ROLE) {
        navOracle = NavOracle(navOracle_);
        emit NavOracleSet(navOracle_);
    }

    /// @notice Update the proposal TTL within the documented bounds.
    function setProposalTtl(uint64 ttl) external onlyProtocolRole(OWNER_ROLE) {
        if (ttl < PROPOSAL_TTL_FLOOR || ttl > PROPOSAL_TTL_CEILING) revert VaultAllocator__InvalidParams();
        proposalTtl = ttl;
        emit ProposalTtlUpdated(ttl);
    }

    // --- Proposal Lifecycle (ALLOCATOR_ROLE) ---

    /// @notice Propose an allocation toward an APPROVED/ACTIVE portfolio.
    ///         Strategy checks run now AND again at execution time.
    function proposeAllocation(address vault, uint256 portfolioId, uint256 amount)
        external
        onlyProtocolRole(ALLOCATOR_ROLE)
        returns (uint256 proposalId)
    {
        if (vault == address(0) || amount == 0) revert VaultAllocator__InvalidParams();
        _checkAllocationGuards(vault, portfolioId, amount);
        proposalId = _storeProposal(vault, portfolioId, amount, false);
    }

    /// @notice Propose a deallocation (risk reduction). No oracle/concentration
    ///         guards: releasing exposure must always remain possible.
    function proposeDeallocation(address vault, uint256 portfolioId, uint256 amount)
        external
        onlyProtocolRole(ALLOCATOR_ROLE)
        returns (uint256 proposalId)
    {
        if (vault == address(0) || amount == 0) revert VaultAllocator__InvalidParams();
        proposalId = _storeProposal(vault, portfolioId, amount, true);
    }

    /// @notice Generic parametric split: proposes one allocation per portfolio,
    ///         weighted in bps (must sum to BASIS_POINTS). The last leg receives
    ///         the rounding remainder so the amounts conserve totalAmount exactly.
    function proposeSplitAllocation(
        address vault,
        uint256[] memory portfolioIds,
        uint256[] memory weightsBps,
        uint256 totalAmount
    ) public onlyProtocolRole(ALLOCATOR_ROLE) returns (uint256[] memory proposalIds) {
        uint256 n = portfolioIds.length;
        if (n == 0 || n != weightsBps.length || totalAmount == 0 || vault == address(0)) {
            revert VaultAllocator__InvalidParams();
        }

        uint256 weightSum;
        for (uint256 i = 0; i < n; i++) {
            if (weightsBps[i] == 0) revert VaultAllocator__InvalidParams();
            weightSum += weightsBps[i];
        }
        if (weightSum != BASIS_POINTS) revert VaultAllocator__WeightsMismatch();

        proposalIds = new uint256[](n);
        uint256 assigned;
        for (uint256 i = 0; i < n; i++) {
            uint256 legAmount = i == n - 1
                ? totalAmount - assigned  // remainder to the last leg (exact conservation)
                : totalAmount * weightsBps[i] / BASIS_POINTS;
            assigned += legAmount;

            _checkAllocationGuards(vault, portfolioIds[i], legAmount);
            proposalIds[i] = _storeProposal(vault, portfolioIds[i], legAmount, false);
        }
    }

    /// @notice Execute a pending proposal. All strategy guards are re-validated
    ///         against CURRENT state; the vault then enforces capacity, buffer,
    ///         UPR, claim reserves and coverage as the final authority.
    function executeAllocation(uint256 proposalId) external onlyProtocolRole(ALLOCATOR_ROLE) {
        AllocationProposal storage p = _getProposal(proposalId);
        if (p.status != ProposalStatus.PROPOSED) {
            revert VaultAllocator__ProposalNotPending(proposalId, p.status);
        }
        if (uint64(block.timestamp) > p.expiresAt) {
            revert VaultAllocator__ProposalExpired(proposalId, p.expiresAt);
        }

        if (p.isDeallocation) {
            p.status = ProposalStatus.EXECUTED;
            InsuranceVault(p.vault).deallocateFromPortfolio(p.portfolioId, p.amount);
        } else {
            // Re-validate eligibility, concentration and oracle guards at execution time.
            _checkAllocationGuards(p.vault, p.portfolioId, p.amount);
            p.status = ProposalStatus.EXECUTED;
            InsuranceVault(p.vault).allocateToPortfolio(p.portfolioId, p.amount);
        }

        emit AllocationExecuted(proposalId, msg.sender);
    }

    /// @notice Cancel a pending proposal. Allowed: original proposer or SENTINEL_ROLE.
    function cancelProposal(uint256 proposalId) external {
        AllocationProposal storage p = _getProposal(proposalId);
        if (p.status != ProposalStatus.PROPOSED) {
            revert VaultAllocator__ProposalNotPending(proposalId, p.status);
        }
        if (msg.sender != p.proposer && !protocolRoles.hasRole(SENTINEL_ROLE, msg.sender)) {
            revert VaultAllocator__UnauthorizedCanceller(msg.sender);
        }
        p.status = ProposalStatus.CANCELLED;
        emit AllocationCancelled(proposalId, msg.sender);
    }

    /// @notice Mark a pending proposal as expired once its TTL has elapsed.
    ///         Permissionless housekeeping.
    function markExpired(uint256 proposalId) external {
        AllocationProposal storage p = _getProposal(proposalId);
        if (p.status != ProposalStatus.PROPOSED) {
            revert VaultAllocator__ProposalNotPending(proposalId, p.status);
        }
        if (uint64(block.timestamp) <= p.expiresAt) {
            revert VaultAllocator__ProposalNotExpired(proposalId, p.expiresAt);
        }
        p.status = ProposalStatus.EXPIRED;
        emit AllocationExpired(proposalId);
    }

    // --- Views ---

    /// @notice Full proposal record (reverts when unknown).
    function getProposal(uint256 proposalId) external view returns (AllocationProposal memory) {
        AllocationProposal memory p = _proposals[proposalId];
        if (p.proposer == address(0)) revert VaultAllocator__ProposalNotFound(proposalId);
        return p;
    }

    /// @notice Number of proposals ever stored.
    function getProposalCount() external view returns (uint256) {
        return nextProposalId;
    }

    /// @notice Investable base used for concentration limits:
    ///         current committed exposure + remaining underwriting capacity.
    function investableBase(address vault) public view returns (uint256) {
        InsuranceVault v = InsuranceVault(vault);
        return v.totalPortfolioAllocated() + v.underwritingCapacity();
    }

    /// @notice Current per-cedant exposure of a vault, computed live from the
    ///         vault and the registry (no duplicated accounting state).
    function cedantExposure(address vault, address cedant) public view returns (uint256 exposure) {
        InsuranceVault v = InsuranceVault(vault);
        uint256[] memory pids = v.getAllocatedPortfolios();
        for (uint256 i = 0; i < pids.length; i++) {
            uint256 alloc = v.portfolioAllocation(pids[i]);
            if (alloc == 0) continue;
            if (portfolioRegistry.getPortfolio(pids[i]).cedant == cedant) {
                exposure += alloc;
            }
        }
    }

    // --- Internal ---

    function _storeProposal(address vault, uint256 portfolioId, uint256 amount, bool isDeallocation)
        internal
        returns (uint256 proposalId)
    {
        proposalId = nextProposalId++;
        uint64 nowTs = uint64(block.timestamp);
        uint64 expiresAt = nowTs + proposalTtl;

        _proposals[proposalId] = AllocationProposal({
            proposalId: proposalId,
            vault: vault,
            portfolioId: portfolioId,
            amount: amount,
            isDeallocation: isDeallocation,
            proposer: msg.sender,
            proposedAt: nowTs,
            expiresAt: expiresAt,
            status: ProposalStatus.PROPOSED
        });

        emit AllocationProposed(proposalId, vault, portfolioId, amount, isDeallocation, msg.sender, expiresAt);
    }

    /// @dev Strategy guards for new allocations: portfolio eligibility, advisory
    ///      oracle freshness, per-portfolio and per-cedant concentration.
    function _checkAllocationGuards(address vault, uint256 portfolioId, uint256 amount) internal view {
        // 1. Portfolio eligibility (re-checked by the vault as well).
        if (!portfolioRegistry.isAllocatable(portfolioId)) {
            revert VaultAllocator__PortfolioNotAllocatable(portfolioId);
        }

        // 2. Advisory oracle guard: paused/anomalous feed blocks; an existing but
        //    stale attestation blocks; a missing attestation does not (advisory).
        if (address(navOracle) != address(0)) {
            if (navOracle.vaultFeedPaused(vault) || navOracle.vaultAnomalyFlagged(vault)) {
                revert VaultAllocator__OracleBlocked(vault);
            }
            NavOracle.NavAttestation memory att = navOracle.rawNavAttestation(vault);
            if (att.updatedAt != 0 && uint64(block.timestamp) > att.updatedAt + navOracle.maxStaleness()) {
                revert VaultAllocator__OracleBlocked(vault);
            }
        }

        // 3. Concentration limits against the CURRENT investable base.
        uint256 base = investableBase(vault);
        InsuranceVault v = InsuranceVault(vault);

        uint256 wouldBePortfolio = v.portfolioAllocation(portfolioId) + amount;
        uint256 portfolioLimit = base * maxPortfolioConcentrationBps / BASIS_POINTS;
        if (wouldBePortfolio > portfolioLimit) {
            revert VaultAllocator__PortfolioConcentrationExceeded(portfolioId, wouldBePortfolio, portfolioLimit);
        }

        address cedant = portfolioRegistry.getPortfolio(portfolioId).cedant;
        uint256 wouldBeCedant = cedantExposure(vault, cedant) + amount;
        uint256 cedantLimit = base * maxCedantConcentrationBps / BASIS_POINTS;
        if (wouldBeCedant > cedantLimit) {
            revert VaultAllocator__CedantConcentrationExceeded(cedant, wouldBeCedant, cedantLimit);
        }
    }

    function _getProposal(uint256 proposalId) internal view returns (AllocationProposal storage p) {
        p = _proposals[proposalId];
        if (p.proposer == address(0)) revert VaultAllocator__ProposalNotFound(proposalId);
    }
}
