// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";
import {InsuranceVault} from "./InsuranceVault.sol";
import {NavOracle} from "./NavOracle.sol";
import {VaultFactory} from "./VaultFactory.sol";

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

    /// @notice Absolute per-portfolio exposure ceiling in asset units (0 = unset).
    /// @dev The binding constraint. A percentage of the investable base moves
    ///      when the base moves, so an allocation that was compliant when made
    ///      can sit above the limit after an LP redeems, without anyone having
    ///      acted. An absolute figure does not move, which is why lending
    ///      protocols on this chain express caps this way.
    uint256 public maxPortfolioExposure;
    /// @notice Absolute per-cedant exposure ceiling in asset units (0 = unset).
    /// @dev Protocol-wide when `vaultFactory` is set, per-vault otherwise. The
    ///      distinction is the whole value of the number: percentage limits
    ///      self-normalise across vaults, because if every vault satisfies
    ///      e_i <= L * b_i then sum(e_i) <= L * sum(b_i). An absolute ceiling
    ///      does not — N vaults each at the ceiling carry N times it — so a
    ///      ceiling meant to cap what the protocol owes one counterparty has to
    ///      be measured across every vault, or it caps nothing.
    uint256 public maxCedantExposure;

    /// @notice Vault registry used to aggregate cedant exposure (0 = per-vault only).
    VaultFactory public vaultFactory;

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
    /// @notice Emitted when the absolute exposure ceilings change.
    event AbsoluteExposureCapsUpdated(uint256 maxPortfolioExposure, uint256 maxCedantExposure);
    /// @notice Emitted when the vault registry backing aggregation changes.
    event VaultFactorySet(address indexed vaultFactory);
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
    /// @notice Allocation would push a portfolio past its absolute ceiling.
    error VaultAllocator__PortfolioExposureCapExceeded(uint256 portfolioId, uint256 wouldBe, uint256 cap);
    /// @notice Allocation would push a cedant past its absolute ceiling.
    error VaultAllocator__CedantExposureCapExceeded(address cedant, uint256 wouldBe, uint256 cap);
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

    /// @notice Set the absolute exposure ceilings, in asset units.
    /// @dev Gated on OWNER_ROLE because OWNER_ROLE is what the ProtocolTimelock
    ///      holds: routing it here is what makes the change announced rather
    ///      than instant. The underwriting curator proposes through the Safe;
    ///      the timelock is what executes.
    ///
    ///      Zero leaves a ceiling unset, which keeps existing deployments
    ///      working exactly as before this was added. An unset ceiling is not a
    ///      safe default, only a compatible one — a deployment meant to rely on
    ///      absolute caps has to set them.
    /// @param portfolioCap Maximum exposure to one portfolio (0 = unset).
    /// @param cedantCap Maximum exposure to one cedant (0 = unset).
    function setAbsoluteExposureCaps(uint256 portfolioCap, uint256 cedantCap) external onlyProtocolRole(OWNER_ROLE) {
        // A cedant ceiling below the portfolio ceiling could never bind in the
        // intended order: a single book would be refused before the cedant
        // aggregate ever was.
        if (portfolioCap != 0 && cedantCap != 0 && cedantCap < portfolioCap) {
            revert VaultAllocator__InvalidParams();
        }
        maxPortfolioExposure = portfolioCap;
        maxCedantExposure = cedantCap;
        emit AbsoluteExposureCapsUpdated(portfolioCap, cedantCap);
    }

    /// @notice Set the vault registry used to aggregate exposure across vaults.
    /// @dev Optional. Without it `maxCedantExposure` binds one vault at a time,
    ///      which is a weaker promise than the name suggests and is why this
    ///      exists. Left unset, behaviour is unchanged.
    function setVaultFactory(address vaultFactory_) external onlyProtocolRole(OWNER_ROLE) {
        vaultFactory = VaultFactory(vaultFactory_);
        emit VaultFactorySet(vaultFactory_);
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

        uint256 weightSum = 0;
        for (uint256 i = 0; i < n; i++) {
            if (weightsBps[i] == 0) revert VaultAllocator__InvalidParams();
            weightSum += weightsBps[i];
        }
        if (weightSum != BASIS_POINTS) revert VaultAllocator__WeightsMismatch();

        proposalIds = new uint256[](n);
        uint256 assigned = 0;
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

    /// @notice Total exposure to one cedant across every vault the factory knows.
    /// @dev Falls back to the single vault when no registry is configured, so
    ///      the caller gets the widest view available rather than a revert.
    ///      `getVaults()` grows with the protocol; this is a view, and the
    ///      allocation path calls it once per proposal, which is the same order
    ///      of work `cedantExposure` already does per vault.
    function protocolCedantExposure(address fallbackVault, address cedant) public view returns (uint256 total) {
        if (address(vaultFactory) == address(0)) {
            return cedantExposure(fallbackVault, cedant);
        }
        address[] memory vaults = vaultFactory.getVaults();
        for (uint256 i; i < vaults.length; ++i) {
            total += cedantExposure(vaults[i], cedant);
        }
    }

    // --- Passive breach reporting ---

    /// @notice Whether a bucket sits above its percentage threshold today.
    ///
    /// @dev A passive breach is a limit exceeded without anyone having acted:
    ///      the exposure did not grow, the investable base shrank underneath it
    ///      when LPs redeemed. Insurance regulation treats this as a distinct
    ///      state from an active breach and does not require a forced unwind —
    ///      the obligation is to stop adding and to return inside the limit as
    ///      a priority, taking account of investors' interests.
    ///
    ///      This protocol follows that shape. Nothing here reverts, blocks a
    ///      redemption, or unwinds a position. Adding to a breaching bucket is
    ///      already impossible, because `_checkAllocationGuards` compares
    ///      current-plus-new against the limit and current alone is already
    ///      past it. What this adds is the ability to see the state and say so,
    ///      rather than leaving it to be inferred from a failed transaction.
    ///
    ///      Unwinding is deliberately not forced. Deallocating from a live
    ///      treaty withdraws the collateral behind cover that has already been
    ///      written; it moves the problem from concentration to solvency
    ///      instead of solving it. Concentration here is corrected by writing
    ///      no more and letting tenor run off.
    ///
    /// @param vault The vault to inspect.
    /// @param portfolioId The book whose bucket is being read.
    /// @return portfolioBreached Portfolio exposure is above its percentage threshold.
    /// @return cedantBreached Cedant exposure is above its percentage threshold.
    /// @return portfolioExcess Amount by which the portfolio bucket is over (0 if not).
    /// @return cedantExcess Amount by which the cedant bucket is over (0 if not).
    function passiveBreachStatus(address vault, uint256 portfolioId)
        external
        view
        returns (bool portfolioBreached, bool cedantBreached, uint256 portfolioExcess, uint256 cedantExcess)
    {
        return _breachOf(vault, portfolioId);
    }

    /// @notice Single-flag form of `passiveBreachStatus`, for callers that only
    ///         need to know whether to show the badge.
    function isInPassiveBreach(address vault, uint256 portfolioId) external view returns (bool) {
        (bool p, bool c,,) = _breachOf(vault, portfolioId);
        return p || c;
    }

    /// @dev The shared computation. Kept internal so the flag form does not have
    ///      to call the tuple form through `this`, which would be a real CALL
    ///      into this same contract: it costs gas the view has no reason to
    ///      spend, and discarding two of its four returns is the kind of thing
    ///      static analysis is right to object to.
    function _breachOf(address vault, uint256 portfolioId)
        internal
        view
        returns (bool portfolioBreached, bool cedantBreached, uint256 portfolioExcess, uint256 cedantExcess)
    {
        uint256 base = investableBase(vault);

        uint256 held = InsuranceVault(vault).portfolioAllocation(portfolioId);
        uint256 portfolioLimit = base * maxPortfolioConcentrationBps / BASIS_POINTS;
        if (held > portfolioLimit) {
            portfolioBreached = true;
            portfolioExcess = held - portfolioLimit;
        }

        address cedant = portfolioRegistry.getPortfolio(portfolioId).cedant;
        uint256 exposure = cedantExposure(vault, cedant);
        uint256 cedantLimit = base * maxCedantConcentrationBps / BASIS_POINTS;
        if (exposure > cedantLimit) {
            cedantBreached = true;
            cedantExcess = exposure - cedantLimit;
        }
    }

    /// @notice Current per-cedant exposure of a single vault, computed live from
    ///         the vault and the registry (no duplicated accounting state).
    /// @dev Scoped to one vault by design. `protocolCedantExposure` is the
    ///      aggregate; keeping them separate means a caller has to say which
    ///      question it is asking.
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

        // 4. Absolute ceilings, checked last because they are the ones that do
        //    not move. The percentage limits above still govern the shape of a
        //    single allocation relative to the vault; these govern how much of
        //    one name the book may hold at all, and a redemption cannot loosen
        //    or tighten them.
        if (maxPortfolioExposure != 0 && wouldBePortfolio > maxPortfolioExposure) {
            revert VaultAllocator__PortfolioExposureCapExceeded(portfolioId, wouldBePortfolio, maxPortfolioExposure);
        }
        if (maxCedantExposure != 0) {
            // Measured across every vault when a registry is configured. Without
            // it the ceiling would bind each vault separately and the protocol
            // could owe one counterparty a multiple of the stated figure.
            uint256 wouldBeProtocol =
                address(vaultFactory) == address(0) ? wouldBeCedant : protocolCedantExposure(vault, cedant) + amount;
            if (wouldBeProtocol > maxCedantExposure) {
                revert VaultAllocator__CedantExposureCapExceeded(cedant, wouldBeProtocol, maxCedantExposure);
            }
        }
    }

    function _getProposal(uint256 proposalId) internal view returns (AllocationProposal storage p) {
        p = _proposals[proposalId];
        if (p.proposer == address(0)) revert VaultAllocator__ProposalNotFound(proposalId);
    }
}
