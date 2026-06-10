// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {PolicyRegistry} from "./PolicyRegistry.sol";
import {MockOracle} from "./MockOracle.sol";
import {ClaimReceipt} from "./ClaimReceipt.sol";
import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {IComplianceRegistry} from "./ComplianceRegistry.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";

/// @title InsuranceVault
/// @notice ERC-4626 vault holding investor deposits + insurer premiums.
///         Tracks NAV via totalAssets(). SECURITY (Phase 9.5): the legacy demo
///         claim paths (checkClaim/reportEvent/submitClaim/exerciseClaim) were
///         REMOVED — the ONLY claim flow is the institutional ClaimManager path
///         (reservePortfolioClaim / payPortfolioClaim, bound address), which is
///         committee-gated with a mandatory dispute window upstream.
/// @dev totalAssets() = USDC.balanceOf(vault) - unearnedPremiums - pendingClaims - accruedFees
///      Uses virtual shares offset (_decimalsOffset = 12) to prevent first-deposit inflation attack.
///      Access control: every permissioned function is gated on-chain through the
///      central ProtocolRoles manager. Per-vault identity bindings (vaultManager,
///      insurerAdmin, oracleReporter) are preserved on top of the global roles.
///      Ownable is retained ONLY for owner() ABI compatibility with the frontend;
///      no function is gated by onlyOwner.
contract InsuranceVault is ERC4626, Ownable, ReentrancyGuard, ProtocolRoleConstants {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // --- Constants ---
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    /// @notice Minimum liquidity buffer ratio: 10% of free capital must stay liquid.
    ///         Institutional floor; prevents fully-deployed vaults with zero exit liquidity.
    uint256 public constant MIN_BUFFER_RATIO_BPS = 1_000;

    /// @notice Maximum annual management fee: 10%. Upper bound for vault creators.
    uint256 public constant MAX_MANAGEMENT_FEE_BPS = 1_000;

    /// @notice depositCap value meaning "no cap configured".
    uint256 public constant UNCAPPED = 0;

    // --- Structs ---
    struct VaultPolicy {
        uint256 policyId;
        uint256 allocationWeight; // Basis points (sum should = 10000)
        uint256 premiumDeposited; // Actual USDC deposited for this policy
        uint256 coverageAmount; // This vault's coverage for this policy
        bool claimed; // Per-vault claim status
        uint256 claimAmount; // Amount claimed (0 if not claimed)
    }

    // --- State ---
    uint256[] public policyIds;
    mapping(uint256 => VaultPolicy) public vaultPolicies;
    mapping(uint256 => bool) public policyAdded;

    uint256 public totalAllocationWeight;
    uint256 public totalPendingClaims;
    uint256 public totalDeployedCapital;
    uint256 public bufferRatioBps; // 2000 = 20%, 1500 = 15%
    uint256 public managementFeeBps; // 50 = 0.5%, 100 = 1%
    uint256 public accumulatedFees;
    uint256 public lastFeeTimestamp;
    string public vaultName;
    address public vaultManager;
    mapping(address => bool) public authorizedPremiumDepositors;

    // --- References ---
    PolicyRegistry public registry;
    MockOracle public oracle;
    ClaimReceipt public claimReceipt;

    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public protocolRoles;

    /// @notice Compliance registry gating nbUSDC mint/transfer/burn (ERC-3643-style mock).
    IComplianceRegistry public complianceRegistry;

    /// @notice Institutional portfolio registry (Phase 2). Source of isAllocatable().
    PortfolioRegistry public portfolioRegistry;

    /// @notice Max total assets the vault accepts (UNCAPPED = no cap). OWNER_ROLE-set.
    uint256 public depositCap;

    /// @notice USDC committed per approved/active portfolio (accounting-only commitment).
    mapping(uint256 => uint256) public portfolioAllocation;

    /// @notice Total USDC committed to portfolio underwriting.
    uint256 public totalPortfolioAllocated;

    uint256[] private _allocatedPortfolioIds;
    mapping(uint256 => bool) private _portfolioTracked;

    /// @notice LP-quota premium received per portfolio via the PremiumDistributor.
    ///         Earned linearly over the portfolio coverage window (UPR accounting).
    mapping(uint256 => uint256) public portfolioPremium;

    uint256[] private _premiumPortfolioIds;
    mapping(uint256 => bool) private _premiumPortfolioTracked;

    /// @notice The only contract allowed to reserve, release and pay portfolio
    ///         claims (Phase 7 ClaimManager). Set by OWNER_ROLE.
    address public claimManager;

    /// @notice The only contract allowed to allocate/deallocate portfolio
    ///         exposure (Phase 9.5 hardening: the VaultAllocator strategy layer).
    ///         Set by OWNER_ROLE. Closes the direct-ALLOCATOR_ROLE bypass: every
    ///         allocation must pass through proposal lifecycle, concentration
    ///         limits and the advisory oracle guard.
    address public vaultAllocator;

    // --- Events ---
    event PolicyAdded(uint256 indexed policyId, uint256 allocationWeight);
    event PremiumDeposited(uint256 indexed policyId, uint256 amount);
    event PolicyExpired(uint256 indexed policyId);
    event FeesCollected(address indexed recipient, uint256 amount);
    event PremiumDepositorUpdated(address indexed depositor, bool authorized);
    event DepositCapUpdated(uint256 newCap);
    event PortfolioAllocated(uint256 indexed portfolioId, uint256 amount, uint256 totalForPortfolio);
    event PortfolioDeallocated(uint256 indexed portfolioId, uint256 amount, uint256 totalForPortfolio);
    event PortfolioPremiumRecorded(uint256 indexed portfolioId, address indexed from, uint256 amount);
    event ClaimManagerUpdated(address indexed claimManager);
    event VaultAllocatorUpdated(address indexed vaultAllocator);
    event PortfolioClaimReserved(
        uint256 indexed claimId, uint256 indexed portfolioId, uint256 amount, uint256 allocationReleased
    );
    event PortfolioClaimReserveReleased(uint256 indexed claimId, uint256 indexed portfolioId, uint256 amount);
    event PortfolioClaimPaid(uint256 indexed claimId, uint256 indexed portfolioId, address indexed to, uint256 amount);

    // --- Errors ---
    error InsuranceVault__PolicyNotActive(uint256 policyId);
    error InsuranceVault__PolicyAlreadyAdded(uint256 policyId);
    error InsuranceVault__PolicyNotInVault(uint256 policyId);
    error InsuranceVault__InsufficientBuffer(uint256 requested, uint256 available);
    error InsuranceVault__UnauthorizedCaller(address caller);
    error InsuranceVault__InvalidParams();
    error InsuranceVault__NoFeesToClaim();
    error InsuranceVault__PortfolioNotAllocatable(uint256 portfolioId);
    error InsuranceVault__AllocationExceedsCapacity(uint256 requested, uint256 capacity);
    error InsuranceVault__AllocationExceedsCoverage(uint256 portfolioId, uint256 requested, uint256 coverageLimit);
    error InsuranceVault__DeallocationExceedsAllocation(uint256 portfolioId, uint256 requested, uint256 allocated);
    error InsuranceVault__NotClaimManager(address caller);
    error InsuranceVault__NotVaultAllocator(address caller);
    error InsuranceVault__ClaimReserveInsufficientFunds(uint256 requested, uint256 freeFunds);
    error InsuranceVault__ClaimReserveUnderflow(uint256 requested, uint256 reserved);

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert InsuranceVault__UnauthorizedCaller(msg.sender);
        }
        _;
    }

    /// @dev Per-vault manager identity AND global Underwriting Curator role.
    modifier onlyVaultManager() {
        if (msg.sender != vaultManager) revert InsuranceVault__UnauthorizedCaller(msg.sender);
        if (!protocolRoles.hasRole(UNDERWRITING_CURATOR_ROLE, msg.sender)) {
            revert InsuranceVault__UnauthorizedCaller(msg.sender);
        }
        _;
    }

    /// @dev Only the bound ClaimManager contract (claim solvency path).
    modifier onlyClaimManager() {
        if (msg.sender != claimManager) revert InsuranceVault__NotClaimManager(msg.sender);
        _;
    }

    /// @dev Only the bound VaultAllocator contract (allocation strategy path).
    modifier onlyVaultAllocator() {
        if (msg.sender != vaultAllocator) revert InsuranceVault__NotVaultAllocator(msg.sender);
        _;
    }

    modifier checkExpiredPolicies() {
        _checkExpiredPolicies();
        _;
    }

    // --- Constructor ---

    /// @notice Constructor parameters packed in a struct to stay within
    ///         legacy-codegen stack limits (12 fields, 4 dynamic strings).
    struct VaultInitParams {
        IERC20 asset;
        string name;
        string symbol;
        string vaultName;
        address owner;
        address vaultManager;
        uint256 bufferRatioBps;
        uint256 managementFeeBps;
        address registry;
        address oracle;
        address claimReceipt;
        address protocolRoles;
        address complianceRegistry;
        address portfolioRegistry;
    }

    constructor(VaultInitParams memory p) ERC4626(p.asset) ERC20(p.name, p.symbol) Ownable(p.owner) {
        if (p.protocolRoles == address(0)) revert InsuranceVault__InvalidParams();
        // Compliance and portfolio registries are mandatory: RWA shares cannot be ungated.
        if (p.complianceRegistry == address(0) || p.portfolioRegistry == address(0)) {
            revert InsuranceVault__InvalidParams();
        }
        // Parametric bounds, documented above (no magic numbers).
        if (p.bufferRatioBps < MIN_BUFFER_RATIO_BPS || p.bufferRatioBps > BASIS_POINTS) {
            revert InsuranceVault__InvalidParams();
        }
        if (p.managementFeeBps > MAX_MANAGEMENT_FEE_BPS) revert InsuranceVault__InvalidParams();

        vaultName = p.vaultName;
        vaultManager = p.vaultManager;
        bufferRatioBps = p.bufferRatioBps;
        managementFeeBps = p.managementFeeBps;
        registry = PolicyRegistry(p.registry);
        oracle = MockOracle(p.oracle);
        claimReceipt = ClaimReceipt(p.claimReceipt);
        protocolRoles = ProtocolRoles(p.protocolRoles);
        complianceRegistry = IComplianceRegistry(p.complianceRegistry);
        portfolioRegistry = PortfolioRegistry(p.portfolioRegistry);

        // IMPORTANT: Initialize lastFeeTimestamp to currentTime() to prevent
        // fee accrual from block.timestamp = 0.
        lastFeeTimestamp = registry.currentTime();
    }

    // --- ERC4626 Overrides ---

    /// @notice Returns 12 to bridge USDC 6 decimals to share 18 decimals.
    ///         This provides virtual shares offset for first-deposit inflation attack protection.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 12;
    }

    /// @dev Compliance gate on every share movement (mint, transfer, burn).
    ///      Mint requires an eligible receiver; transfers require an eligible
    ///      receiver and a non-blocked sender; burns require only a non-blocked
    ///      sender so de-whitelisted LPs can still exit compliantly.
    function _update(address from, address to, uint256 value) internal override {
        complianceRegistry.requireCanTransfer(from, to, value);
        super._update(from, to, value);
    }

    /// @notice Deposits are capped by compliance eligibility, the vault depositCap
    ///         and the per-investor compliance limit (0 = unlimited for both).
    function maxDeposit(address receiver) public view override returns (uint256) {
        if (!complianceRegistry.canReceive(receiver)) return 0;

        uint256 remaining = type(uint256).max;
        if (depositCap != UNCAPPED) {
            uint256 assetsNow = totalAssets();
            remaining = assetsNow >= depositCap ? 0 : depositCap - assetsNow;
        }
        uint256 limit = complianceRegistry.investorLimit(receiver);
        if (limit != 0) {
            uint256 held = _convertToAssets(balanceOf(receiver), Math.Rounding.Floor);
            uint256 limitRemaining = held >= limit ? 0 : limit - held;
            remaining = Math.min(remaining, limitRemaining);
        }
        return remaining;
    }

    /// @notice Share-denominated mirror of maxDeposit.
    function maxMint(address receiver) public view override returns (uint256) {
        uint256 assets = maxDeposit(receiver);
        if (assets == type(uint256).max) return type(uint256).max;
        return _convertToShares(assets, Math.Rounding.Floor);
    }

    /// @notice Custom NAV formula:
    ///         totalAssets = balance - unearnedPremiums - pendingClaims - accruedFees
    ///         Floors at zero, never reverts.
    function totalAssets() public view override returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 unearned = _totalUnearnedPremiums();
        uint256 pending = totalPendingClaims;

        // Compute pre-fee assets first to break circularity
        uint256 preFeeAssets;
        if (balance > unearned + pending) {
            preFeeAssets = balance - unearned - pending;
        } else {
            return 0; // Floor at zero, never revert
        }

        uint256 fees = _accruedFees(preFeeAssets);
        if (preFeeAssets > fees) {
            return preFeeAssets - fees;
        }
        return 0;
    }

    /// @notice Cap withdrawals at available buffer. Blocked addresses are frozen.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        if (complianceRegistry.isBlocked(owner_)) return 0;
        uint256 userAssets = _convertToAssets(balanceOf(owner_), Math.Rounding.Floor);
        uint256 available = _availableBuffer();
        return Math.min(userAssets, available);
    }

    /// @notice Cap redemptions at available buffer (in shares).
    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 maxAssets = maxWithdraw(owner_);
        return _convertToShares(maxAssets, Math.Rounding.Floor);
    }

    /// @dev Override deposit to accrue fees.
    ///      NOTE (Phase 3): the legacy demo behavior that auto-marked
    ///      (100% - bufferRatio) of every deposit as "deployed" has been removed.
    ///      Capital is committed exclusively through allocateToPortfolio(), where
    ///      the buffer ratio is enforced (underwritingCapacity). Deposited but
    ///      unallocated capital remains withdrawable.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        checkExpiredPolicies
    {
        _accrueFeesInternal();

        super._deposit(caller, receiver, assets, shares);
    }

    /// @dev Override withdraw to accrue fees, validate buffer, and update accounting.
    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
        checkExpiredPolicies
    {
        _accrueFeesInternal();

        uint256 available = _availableBuffer();
        if (assets > available) {
            revert InsuranceVault__InsufficientBuffer(assets, available);
        }

        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    // --- Policy Management ---

    /// @notice Add a policy from the registry to this vault. Only vault manager.
    /// @param policyId The policy ID in the registry
    /// @param weightBps Allocation weight in basis points
    function addPolicy(uint256 policyId, uint256 weightBps) external onlyVaultManager checkExpiredPolicies {
        if (weightBps == 0) revert InsuranceVault__InvalidParams();
        if (policyAdded[policyId]) revert InsuranceVault__PolicyAlreadyAdded(policyId);

        // Verify policy exists and is active
        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (policy.status != PolicyRegistry.PolicyStatus.ACTIVE) {
            revert InsuranceVault__PolicyNotActive(policyId);
        }

        policyAdded[policyId] = true;
        policyIds.push(policyId);
        totalAllocationWeight += weightBps;

        vaultPolicies[policyId] = VaultPolicy({
            policyId: policyId,
            allocationWeight: weightBps,
            premiumDeposited: 0,
            coverageAmount: policy.coverageAmount,
            claimed: false,
            claimAmount: 0
        });

        emit PolicyAdded(policyId, weightBps);
    }

    /// @notice Deposit premium USDC for a policy already added to the vault.
    ///         Only PREMIUM_DEPOSITOR_ROLE (on-chain gate via ProtocolRoles).
    /// @param policyId The policy to fund
    /// @param amount Premium amount in USDC (6 decimals)
    function depositPremium(uint256 policyId, uint256 amount)
        external
        onlyProtocolRole(PREMIUM_DEPOSITOR_ROLE)
        checkExpiredPolicies
    {
        if (!policyAdded[policyId]) {
            revert InsuranceVault__PolicyNotInVault(policyId);
        }
        if (amount == 0) revert InsuranceVault__InvalidParams();

        _accrueFeesInternal();

        vaultPolicies[policyId].premiumDeposited += amount;

        // Transfer USDC from caller to vault
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit PremiumDeposited(policyId, amount);
    }

    // --- Portfolio Allocation (Phase 3) ---

    /// @notice Underwriting capacity still available for portfolio allocation.
    ///         capacity = (balance - UPR - pendingClaims) * (1 - bufferRatio) - committed.
    ///         Keeps bufferRatioBps of free capital liquid at all times; UPR and
    ///         claim reserves are liabilities and never count as allocatable capital.
    function underwritingCapacity() public view returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 liabilities = _totalUnearnedPremiums() + totalPendingClaims;
        if (balance <= liabilities) return 0;
        uint256 free = balance - liabilities;
        uint256 investable = free * (BASIS_POINTS - bufferRatioBps) / BASIS_POINTS;
        uint256 committed = totalDeployedCapital + totalPortfolioAllocated;
        return investable > committed ? investable - committed : 0;
    }

    /// @notice Commit vault capital to an APPROVED/ACTIVE portfolio.
    ///         Only the bound VaultAllocator contract (Phase 9.5).
    ///         Accounting-only commitment: USDC stays in the vault but is excluded
    ///         from the withdrawal buffer until deallocated.
    /// @param portfolioId Portfolio id in the PortfolioRegistry
    /// @param amount USDC amount to commit (6 decimals)
    function allocateToPortfolio(uint256 portfolioId, uint256 amount) external onlyVaultAllocator checkExpiredPolicies {
        if (amount == 0) revert InsuranceVault__InvalidParams();
        if (!portfolioRegistry.isAllocatable(portfolioId)) {
            revert InsuranceVault__PortfolioNotAllocatable(portfolioId);
        }

        _accrueFeesInternal();

        uint256 capacity = underwritingCapacity();
        if (amount > capacity) revert InsuranceVault__AllocationExceedsCapacity(amount, capacity);

        PortfolioRegistry.Portfolio memory pf = portfolioRegistry.getPortfolio(portfolioId);
        uint256 newAllocation = portfolioAllocation[portfolioId] + amount;
        if (newAllocation > pf.coverageLimit) {
            revert InsuranceVault__AllocationExceedsCoverage(portfolioId, newAllocation, pf.coverageLimit);
        }

        portfolioAllocation[portfolioId] = newAllocation;
        totalPortfolioAllocated += amount;
        if (!_portfolioTracked[portfolioId]) {
            _portfolioTracked[portfolioId] = true;
            _allocatedPortfolioIds.push(portfolioId);
        }

        emit PortfolioAllocated(portfolioId, amount, newAllocation);
    }

    /// @notice Release committed capital from a portfolio.
    ///         Only the bound VaultAllocator contract (Phase 9.5).
    ///         No isAllocatable() check: deallocation is a risk-reduction action and
    ///         must remain possible for PAUSED/EXPIRED portfolios.
    function deallocateFromPortfolio(uint256 portfolioId, uint256 amount)
        external
        onlyVaultAllocator
        checkExpiredPolicies
    {
        if (amount == 0) revert InsuranceVault__InvalidParams();
        uint256 allocated = portfolioAllocation[portfolioId];
        if (amount > allocated) {
            revert InsuranceVault__DeallocationExceedsAllocation(portfolioId, amount, allocated);
        }

        _accrueFeesInternal();

        uint256 newAllocation = allocated - amount;
        portfolioAllocation[portfolioId] = newAllocation;
        totalPortfolioAllocated -= amount;

        emit PortfolioDeallocated(portfolioId, amount, newAllocation);
    }

    /// @notice Record an LP-quota premium for a portfolio and pull the USDC in.
    ///         Only PREMIUM_DEPOSITOR_ROLE -- in production this role is granted to
    ///         the PremiumDistributor contract, which forwards the post-split LP quota.
    ///         The amount enters UPR and is earned linearly over the portfolio
    ///         coverage window [inceptionTime, expiryTime] (real time, consistent
    ///         with PortfolioRegistry; the legacy demo virtual clock is not used here).
    /// @param portfolioId Portfolio id in the PortfolioRegistry
    /// @param amount LP-quota premium in USDC (6 decimals)
    function recordPortfolioPremium(uint256 portfolioId, uint256 amount)
        external
        onlyProtocolRole(PREMIUM_DEPOSITOR_ROLE)
        checkExpiredPolicies
    {
        if (amount == 0) revert InsuranceVault__InvalidParams();
        if (!portfolioRegistry.isAllocatable(portfolioId)) {
            revert InsuranceVault__PortfolioNotAllocatable(portfolioId);
        }

        _accrueFeesInternal();

        portfolioPremium[portfolioId] += amount;
        if (!_premiumPortfolioTracked[portfolioId]) {
            _premiumPortfolioTracked[portfolioId] = true;
            _premiumPortfolioIds.push(portfolioId);
        }

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit PortfolioPremiumRecorded(portfolioId, msg.sender, amount);
    }

    // --- Portfolio Claim Path (Phase 7; callable only by the bound ClaimManager) ---

    /// @notice Bind the ClaimManager contract. Only OWNER_ROLE.
    function setClaimManager(address claimManager_) external onlyProtocolRole(OWNER_ROLE) {
        claimManager = claimManager_;
        emit ClaimManagerUpdated(claimManager_);
    }

    /// @notice Bind the VaultAllocator contract. Only OWNER_ROLE.
    function setVaultAllocator(address vaultAllocator_) external onlyProtocolRole(OWNER_ROLE) {
        vaultAllocator = vaultAllocator_;
        emit VaultAllocatorUpdated(vaultAllocator_);
    }

    /// @notice Reserve USDC for an approved portfolio claim. Only ClaimManager.
    ///         INSOLVENCY GUARD: the reserve must be fully backed by vault cash
    ///         net of UPR (a liability) and existing claim reserves. The portion
    ///         of the portfolio's committed allocation absorbed by the claim is
    ///         released (capital converts from underwriting commitment to reserve).
    function reservePortfolioClaim(uint256 claimId, uint256 portfolioId, uint256 amount) external onlyClaimManager {
        if (amount == 0) revert InsuranceVault__InvalidParams();

        _accrueFeesInternal();

        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 liabilities = _totalUnearnedPremiums() + totalPendingClaims;
        uint256 freeFunds = balance > liabilities ? balance - liabilities : 0;
        if (amount > freeFunds) {
            revert InsuranceVault__ClaimReserveInsufficientFunds(amount, freeFunds);
        }

        // Convert committed underwriting capital into claim reserve (up to the claim).
        uint256 allocationReleased = portfolioAllocation[portfolioId];
        if (allocationReleased > amount) allocationReleased = amount;
        if (allocationReleased > 0) {
            portfolioAllocation[portfolioId] -= allocationReleased;
            totalPortfolioAllocated -= allocationReleased;
        }

        totalPendingClaims += amount;

        emit PortfolioClaimReserved(claimId, portfolioId, amount, allocationReleased);
    }

    /// @notice Release a claim reserve (claim rejected after approval). Only ClaimManager.
    ///         The released amount returns to the liquid buffer; the previously
    ///         absorbed allocation is NOT restored (conservative: re-allocation
    ///         must go through the allocator strategy again).
    function releasePortfolioClaimReserve(uint256 claimId, uint256 portfolioId, uint256 amount)
        external
        onlyClaimManager
    {
        if (amount == 0) revert InsuranceVault__InvalidParams();
        if (amount > totalPendingClaims) {
            revert InsuranceVault__ClaimReserveUnderflow(amount, totalPendingClaims);
        }
        totalPendingClaims -= amount;
        emit PortfolioClaimReserveReleased(claimId, portfolioId, amount);
    }

    /// @notice Pay a reserved portfolio claim. Only ClaimManager. CEI + reentrancy
    ///         guard; the payout can never exceed the standing claim reserve.
    function payPortfolioClaim(uint256 claimId, uint256 portfolioId, address to, uint256 amount)
        external
        onlyClaimManager
        nonReentrant
    {
        if (to == address(0) || amount == 0) revert InsuranceVault__InvalidParams();
        if (amount > totalPendingClaims) {
            revert InsuranceVault__ClaimReserveUnderflow(amount, totalPendingClaims);
        }

        _accrueFeesInternal();

        // SECURITY: state changes BEFORE the external transfer (CEI).
        totalPendingClaims -= amount;

        IERC20(asset()).safeTransfer(to, amount);

        emit PortfolioClaimPaid(claimId, portfolioId, to, amount);
    }

    /// @notice Set the vault deposit cap (UNCAPPED = 0 disables). Only OWNER_ROLE.
    function setDepositCap(uint256 newCap) external onlyProtocolRole(OWNER_ROLE) {
        depositCap = newCap;
        emit DepositCapUpdated(newCap);
    }

    // --- Role Management ---

    /// @notice Set or revoke premium depositor flag. Only OWNER_ROLE.
    /// @dev DEPRECATED: informational mirror kept for frontend ABI compatibility.
    ///      The on-chain gate for depositPremium() is PREMIUM_DEPOSITOR_ROLE in
    ///      ProtocolRoles; this mapping no longer grants deposit rights.
    function setAuthorizedPremiumDepositor(address depositor, bool authorized) external onlyProtocolRole(OWNER_ROLE) {
        authorizedPremiumDepositors[depositor] = authorized;
        emit PremiumDepositorUpdated(depositor, authorized);
    }

    // --- Fee Management ---

    /// @notice Withdraw accumulated fees to a recipient. Only OWNER_ROLE.
    /// @param recipient Address to receive the fees
    function claimFees(address recipient) external onlyProtocolRole(OWNER_ROLE) {
        _accrueFeesInternal();

        uint256 fees = accumulatedFees;
        if (fees == 0) revert InsuranceVault__NoFeesToClaim();

        accumulatedFees = 0;

        IERC20(asset()).safeTransfer(recipient, fees);

        emit FeesCollected(recipient, fees);
    }

    // --- Frontend View Helpers ---

    /// @notice Aggregated vault info for frontend (reduces RPC calls).
    function getVaultInfo()
        external
        view
        returns (
            string memory name,
            address manager,
            uint256 assets,
            uint256 shares,
            uint256 sharePrice,
            uint256 bufferBps,
            uint256 feeBps,
            uint256 availableBuffer,
            uint256 deployedCapital,
            uint256 policyCount
        )
    {
        uint256 totalShares = totalSupply();
        uint256 totalAssetsVal = totalAssets();

        // sharePrice in USDC decimals (6 decimals precision)
        // If no shares, price is 1:1 (1e6 = $1.00)
        uint256 price = totalShares > 0 ? (totalAssetsVal * 1e18) / totalShares : 1e6;

        return (
            vaultName,
            vaultManager,
            totalAssetsVal,
            totalShares,
            price,
            bufferRatioBps,
            managementFeeBps,
            _availableBuffer(),
            totalDeployedCapital,
            policyIds.length
        );
    }

    /// @notice Get vault policy info for frontend.
    /// @param policyId The policy to query
    function getVaultPolicy(uint256 policyId)
        external
        view
        returns (
            uint256 allocationWeight,
            uint256 premium,
            uint256 earnedPremium,
            uint256 coverage,
            uint256 duration,
            uint256 startTime,
            uint256 timeRemaining,
            bool claimed,
            bool expired
        )
    {
        // Assign directly to named return variables to minimize stack depth
        {
            VaultPolicy storage vp = vaultPolicies[policyId];
            allocationWeight = vp.allocationWeight;
            premium = vp.premiumDeposited;
            coverage = vp.coverageAmount;
            claimed = vp.claimed;
        }

        {
            PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
            duration = policy.duration;
            startTime = policy.startTime;
        }

        earnedPremium = _earnedPremiumFor(policyId, vaultPolicies[policyId]);
        timeRemaining = registry.getRemainingDuration(policyId);
        expired = registry.isPolicyExpired(policyId);
    }

    /// @dev Calculate earned premium for a single vault policy.
    function _earnedPremiumFor(uint256 policyId, VaultPolicy memory vp) internal view returns (uint256) {
        if (vp.claimed) return vp.premiumDeposited;
        if (vp.premiumDeposited == 0) return 0;

        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (policy.startTime == 0) return 0;

        uint256 now_ = registry.currentTime();
        uint256 elapsed = now_ > policy.startTime ? now_ - policy.startTime : 0;
        if (elapsed >= policy.duration) return vp.premiumDeposited;
        return vp.premiumDeposited * elapsed / policy.duration;
    }

    /// @notice Get all policy IDs in this vault.
    function getPolicyIds() external view returns (uint256[] memory) {
        return policyIds;
    }

    /// @notice Portfolio ids that have (or had) capital committed.
    function getAllocatedPortfolios() external view returns (uint256[] memory) {
        return _allocatedPortfolioIds;
    }

    /// @notice Aggregated hardening accounting for frontend/indexer (additive view;
    ///         getVaultInfo() is preserved unchanged for ABI stability).
    function getVaultAccounting()
        external
        view
        returns (
            uint256 balance,
            uint256 unearnedPremiums,
            uint256 pendingClaims,
            uint256 deployedCapital,
            uint256 portfolioAllocated,
            uint256 availableBuffer,
            uint256 capacity,
            uint256 cap
        )
    {
        return (
            IERC20(asset()).balanceOf(address(this)),
            _totalUnearnedPremiums(),
            totalPendingClaims,
            totalDeployedCapital,
            totalPortfolioAllocated,
            _availableBuffer(),
            underwritingCapacity(),
            depositCap
        );
    }

    // --- Internal Helpers ---

    /// @dev Calculate total unearned premiums across all policies.
    ///      Claimed policies contribute 0 (premium accrual stops on claim).
    ///      Expired policies contribute 0 (fully earned).
    function _totalUnearnedPremiums() internal view returns (uint256) {
        uint256 total = 0;
        uint256 now_ = registry.currentTime();

        for (uint256 i = 0; i < policyIds.length; i++) {
            uint256 pid = policyIds[i];
            VaultPolicy memory vp = vaultPolicies[pid];

            // Claimed policies: premium accrual stops, unearned = 0
            if (vp.claimed) continue;

            // No premium deposited: nothing to accrue
            if (vp.premiumDeposited == 0) continue;

            // Read policy data for timing
            PolicyRegistry.Policy memory policy = registry.getPolicy(pid);

            // Not yet active: full premium is unearned
            if (policy.startTime == 0) {
                total += vp.premiumDeposited;
                continue;
            }

            uint256 elapsed = now_ > policy.startTime ? now_ - policy.startTime : 0;

            // Expired: fully earned, unearned = 0
            if (elapsed >= policy.duration) continue;

            // Active: linear accrual
            uint256 unearned = vp.premiumDeposited * (policy.duration - elapsed) / policy.duration;
            total += unearned;
        }

        // Portfolio premiums (Phase 4): linear UPR over the coverage window.
        for (uint256 i = 0; i < _premiumPortfolioIds.length; i++) {
            total += _portfolioUnearned(_premiumPortfolioIds[i]);
        }

        return total;
    }

    /// @dev Unearned portion of a portfolio's LP-quota premium. Liability: rounds UP.
    ///      Uses real block.timestamp (PortfolioRegistry convention).
    function _portfolioUnearned(uint256 portfolioId) internal view returns (uint256) {
        uint256 amt = portfolioPremium[portfolioId];
        if (amt == 0) return 0;

        PortfolioRegistry.Portfolio memory pf = portfolioRegistry.getPortfolio(portfolioId);
        uint64 nowTs = uint64(block.timestamp);
        if (nowTs >= pf.expiryTime) return 0;
        if (nowTs <= pf.inceptionTime) return amt;
        return Math.mulDiv(amt, pf.expiryTime - nowTs, pf.expiryTime - pf.inceptionTime, Math.Rounding.Ceil);
    }

    /// @dev Calculate accrued fees using pre-fee basis to break circularity.
    /// @param preFeeAssets Pre-fee asset value (balance - unearned - pending)
    /// @return Total accrued fees (accumulated + newly accrued)
    function _accruedFees(uint256 preFeeAssets) internal view returns (uint256) {
        uint256 elapsed = registry.currentTime() - lastFeeTimestamp;
        uint256 newFees = preFeeAssets * managementFeeBps * elapsed / (BASIS_POINTS * SECONDS_PER_YEAR);
        return accumulatedFees + newFees;
    }

    /// @dev Accrue fees to storage. Called on every state-changing operation.
    function _accrueFeesInternal() internal {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 unearned = _totalUnearnedPremiums();
        uint256 pending = totalPendingClaims;
        uint256 preFeeAssets = balance > unearned + pending ? balance - unearned - pending : 0;

        uint256 now_ = registry.currentTime();
        uint256 elapsed = now_ - lastFeeTimestamp;
        accumulatedFees += preFeeAssets * managementFeeBps * elapsed / (BASIS_POINTS * SECONDS_PER_YEAR);
        lastFeeTimestamp = now_;
    }

    /// @dev Calculate available buffer for withdrawals.
    ///      buffer = balance - deployed - pendingClaims - portfolioAllocated - UPR.
    ///      UPR is a liability (unearned premium cash) and committed underwriting
    ///      capital is locked: neither may ever be consumed by LP withdrawals.
    function _availableBuffer() internal view returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 reserved =
            totalDeployedCapital + totalPendingClaims + totalPortfolioAllocated + _totalUnearnedPremiums();
        if (balance <= reserved) return 0;
        return balance - reserved;
    }

    /// @dev Lazily check and mark expired policies.
    ///      Called via modifier on state-changing functions ONLY (not view functions).
    function _checkExpiredPolicies() internal {
        for (uint256 i = 0; i < policyIds.length; i++) {
            uint256 pid = policyIds[i];
            VaultPolicy memory vp = vaultPolicies[pid];

            // Skip already claimed policies
            if (vp.claimed) continue;

            // Check if expired
            if (registry.isPolicyExpired(pid)) {
                // Return deployed capital to buffer (accounting-only)
                uint256 policyDeployed = vp.coverageAmount;
                if (policyDeployed > totalDeployedCapital) {
                    totalDeployedCapital = 0;
                } else {
                    totalDeployedCapital -= policyDeployed;
                }

                emit PolicyExpired(pid);
            }
        }
    }
}
