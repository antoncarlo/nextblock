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

/// @title InsuranceVault
/// @notice ERC-4626 vault holding investor deposits + insurer premiums.
///         Processes three claim paths and tracks NAV via totalAssets().
/// @dev totalAssets() = USDC.balanceOf(vault) - unearnedPremiums - pendingClaims - accruedFees
///      Uses virtual shares offset (_decimalsOffset = 12) to prevent first-deposit inflation attack.
contract InsuranceVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    // --- Constants ---
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // --- Structs ---
    struct VaultPolicy {
        uint256 policyId;
        uint256 allocationWeight;   // Basis points (sum should = 10000)
        uint256 premiumDeposited;   // Actual USDC deposited for this policy
        uint256 coverageAmount;     // This vault's coverage for this policy
        bool claimed;               // Per-vault claim status
        uint256 claimAmount;        // Amount claimed (0 if not claimed)
    }

    // --- State ---
    uint256[] public policyIds;
    mapping(uint256 => VaultPolicy) public vaultPolicies;
    mapping(uint256 => bool) public policyAdded;

    uint256 public totalAllocationWeight;
    uint256 public totalPendingClaims;
    uint256 public totalDeployedCapital;
    uint256 public bufferRatioBps;       // 2000 = 20%, 1500 = 15%
    uint256 public managementFeeBps;     // 50 = 0.5%, 100 = 1%
    uint256 public accumulatedFees;
    uint256 public lastFeeTimestamp;
    string public vaultName;
    address public vaultManager;
    address public oracleReporter;
    address public insurerAdmin;
    mapping(address => bool) public authorizedPremiumDepositors;

    // --- References ---
    PolicyRegistry public registry;
    MockOracle public oracle;
    ClaimReceipt public claimReceipt;

    // --- Events ---
    event PolicyAdded(uint256 indexed policyId, uint256 allocationWeight);
    event PremiumDeposited(uint256 indexed policyId, uint256 amount);
    event ClaimTriggered(uint256 indexed policyId, uint256 amount, address insurer, uint256 receiptId);
    event ClaimAutoExercised(uint256 indexed receiptId, uint256 payout, address insurer);
    event ClaimExercised(uint256 indexed receiptId, uint256 payout, address insurer);
    event ClaimShortfall(uint256 indexed receiptId, uint256 claimAmount, uint256 vaultBalance);
    event PolicyExpired(uint256 indexed policyId);
    event FeesCollected(address indexed recipient, uint256 amount);
    event OracleReporterUpdated(address indexed reporter);
    event InsurerAdminUpdated(address indexed admin);
    event PremiumDepositorUpdated(address indexed depositor, bool authorized);

    // --- Errors ---
    error InsuranceVault__PolicyNotActive(uint256 policyId);
    error InsuranceVault__PolicyAlreadyClaimed(uint256 policyId);
    error InsuranceVault__PolicyAlreadyAdded(uint256 policyId);
    error InsuranceVault__PolicyNotInVault(uint256 policyId);
    error InsuranceVault__InsufficientBuffer(uint256 requested, uint256 available);
    error InsuranceVault__UnauthorizedCaller(address caller);
    error InsuranceVault__InvalidClaimAmount(uint256 amount, uint256 maxAllowed);
    error InsuranceVault__WrongVerificationType(uint256 policyId);
    error InsuranceVault__OracleConditionNotMet(uint256 policyId);
    error InsuranceVault__InvalidReceipt(uint256 receiptId);
    error InsuranceVault__InvalidParams();
    error InsuranceVault__NoFeesToClaim();

    // --- Modifiers ---
    modifier onlyVaultManager() {
        if (msg.sender != vaultManager) revert InsuranceVault__UnauthorizedCaller(msg.sender);
        _;
    }

    modifier onlyOracleReporter() {
        if (msg.sender != oracleReporter) revert InsuranceVault__UnauthorizedCaller(msg.sender);
        _;
    }

    modifier onlyInsurerAdmin() {
        if (msg.sender != insurerAdmin) revert InsuranceVault__UnauthorizedCaller(msg.sender);
        _;
    }

    modifier checkExpiredPolicies() {
        _checkExpiredPolicies();
        _;
    }

    // --- Constructor ---
    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        string memory vaultName_,
        address owner_,
        address vaultManager_,
        uint256 bufferRatioBps_,
        uint256 managementFeeBps_,
        address registry_,
        address oracle_,
        address claimReceipt_
    )
        ERC4626(asset_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        vaultName = vaultName_;
        vaultManager = vaultManager_;
        bufferRatioBps = bufferRatioBps_;
        managementFeeBps = managementFeeBps_;
        registry = PolicyRegistry(registry_);
        oracle = MockOracle(oracle_);
        claimReceipt = ClaimReceipt(claimReceipt_);

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

    /// @notice Cap withdrawals at available buffer.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        uint256 userAssets = _convertToAssets(balanceOf(owner_), Math.Rounding.Floor);
        uint256 available = _availableBuffer();
        return Math.min(userAssets, available);
    }

    /// @notice Cap redemptions at available buffer (in shares).
    function maxRedeem(address owner_) public view override returns (uint256) {
        uint256 maxAssets = maxWithdraw(owner_);
        return _convertToShares(maxAssets, Math.Rounding.Floor);
    }

    /// @dev Override deposit to accrue fees and update deployed capital accounting.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override checkExpiredPolicies {
        _accrueFeesInternal();

        super._deposit(caller, receiver, assets, shares);

        // Update deployed capital accounting: (100% - bufferRatio) of deposit is "deployed"
        uint256 deployed = assets * (BASIS_POINTS - bufferRatioBps) / BASIS_POINTS;
        totalDeployedCapital += deployed;
    }

    /// @dev Override withdraw to accrue fees, validate buffer, and update accounting.
    function _withdraw(
        address caller,
        address receiver,
        address owner_,
        uint256 assets,
        uint256 shares
    ) internal override checkExpiredPolicies {
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
    ///         Only owner or authorized premium depositors.
    /// @param policyId The policy to fund
    /// @param amount Premium amount in USDC (6 decimals)
    function depositPremium(uint256 policyId, uint256 amount) external checkExpiredPolicies {
        if (msg.sender != owner() && !authorizedPremiumDepositors[msg.sender]) {
            revert InsuranceVault__UnauthorizedCaller(msg.sender);
        }
        if (!policyAdded[policyId]) revert InsuranceVault__PolicyNotInVault(policyId);
        if (amount == 0) revert InsuranceVault__InvalidParams();

        _accrueFeesInternal();

        vaultPolicies[policyId].premiumDeposited += amount;

        // Transfer USDC from caller to vault
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit PremiumDeposited(policyId, amount);
    }

    // --- Claim Triggers ---

    /// @notice Permissionless on-chain claim trigger (P1: BTC Price Protection).
    ///         Anyone can call. Reads oracle price and auto-triggers if below threshold.
    /// @param policyId The policy to check
    function checkClaim(uint256 policyId) external nonReentrant checkExpiredPolicies {
        VaultPolicy storage vp = _validateClaimPreconditions(policyId);

        // Verify this is an ON_CHAIN policy
        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (policy.verificationType != PolicyRegistry.VerificationType.ON_CHAIN) {
            revert InsuranceVault__WrongVerificationType(policyId);
        }

        // Read oracle and verify condition
        (int256 price, uint256 updatedAt) = oracle.getBtcPrice();
        // SECURITY: Verify oracle has been updated (prevent false trigger on uninitialized oracle)
        if (updatedAt == 0) revert InsuranceVault__OracleConditionNotMet(policyId);
        if (price > policy.triggerThreshold) {
            revert InsuranceVault__OracleConditionNotMet(policyId);
        }

        // Trigger claim for full coverage
        _processClaim(policyId, vp.coverageAmount, policy.insurer);
    }

    /// @notice Oracle reporter claim trigger (P2: Flight Delay).
    ///         Only oracle reporter can call. Reads oracle and verifies condition.
    /// @param policyId The policy to check
    function reportEvent(uint256 policyId) external onlyOracleReporter nonReentrant checkExpiredPolicies {
        VaultPolicy storage vp = _validateClaimPreconditions(policyId);

        // Verify this is an ORACLE_DEPENDENT policy
        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (policy.verificationType != PolicyRegistry.VerificationType.ORACLE_DEPENDENT) {
            revert InsuranceVault__WrongVerificationType(policyId);
        }

        // Read oracle and verify condition
        (bool delayed, uint256 updatedAt) = oracle.getFlightStatus();
        if (updatedAt == 0) revert InsuranceVault__OracleConditionNotMet(policyId);
        if (!delayed) revert InsuranceVault__OracleConditionNotMet(policyId);

        // Trigger claim for full coverage
        _processClaim(policyId, vp.coverageAmount, policy.insurer);
    }

    /// @notice Insurer admin claim trigger (P3: Commercial Fire).
    ///         Only insurer admin can call. Partial claims allowed.
    /// @param policyId The policy to submit a claim for
    /// @param amount Assessed claim amount (can be less than coverage)
    function submitClaim(uint256 policyId, uint256 amount) external onlyInsurerAdmin nonReentrant checkExpiredPolicies {
        VaultPolicy storage vp = _validateClaimPreconditions(policyId);

        // Verify this is an OFF_CHAIN policy
        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (policy.verificationType != PolicyRegistry.VerificationType.OFF_CHAIN) {
            revert InsuranceVault__WrongVerificationType(policyId);
        }

        // Validate claim amount
        if (amount == 0 || amount > vp.coverageAmount) {
            revert InsuranceVault__InvalidClaimAmount(amount, vp.coverageAmount);
        }

        // Single claim consumes policy fully (remaining coverage forfeited)
        _processClaim(policyId, amount, policy.insurer);
    }

    // --- Claim Settlement ---

    /// @notice Exercise a claim receipt: transfer USDC to insurer, burn receipt.
    /// @dev Reentrancy guard on this function (state changes before USDC transfer).
    /// @param receiptId The claim receipt ID to exercise
    function exerciseClaim(uint256 receiptId) external nonReentrant checkExpiredPolicies {
        _accrueFeesInternal();

        ClaimReceipt.Receipt memory receipt = claimReceipt.getReceipt(receiptId);

        // Validate receipt
        if (receipt.vault != address(this)) {
            revert InsuranceVault__InvalidReceipt(receiptId);
        }
        if (receipt.insurer != msg.sender) {
            revert InsuranceVault__UnauthorizedCaller(msg.sender);
        }
        if (receipt.exercised) {
            revert InsuranceVault__InvalidReceipt(receiptId);
        }

        uint256 claimAmount = receipt.claimAmount;

        // Payout capped at vault balance
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 payout = Math.min(claimAmount, balance);

        // SECURITY: State changes BEFORE external transfer
        totalPendingClaims -= claimAmount;

        // Reduce deployed capital (floor at 0)
        if (claimAmount >= totalDeployedCapital) {
            totalDeployedCapital = 0;
        } else {
            totalDeployedCapital -= claimAmount;
        }

        // Mark exercised on ClaimReceipt (sets exercised=true AND burns NFT)
        claimReceipt.markExercised(receiptId);

        // Transfer USDC to insurer
        if (payout > 0) {
            IERC20(asset()).safeTransfer(msg.sender, payout);
        }

        if (payout < claimAmount) {
            emit ClaimShortfall(receiptId, claimAmount, payout);
        }

        emit ClaimExercised(receiptId, payout, msg.sender);
    }

    // --- Role Management ---

    /// @notice Set the oracle reporter address. Only owner.
    function setOracleReporter(address reporter) external onlyOwner {
        oracleReporter = reporter;
        emit OracleReporterUpdated(reporter);
    }

    /// @notice Set the insurer admin address. Only owner.
    function setInsurerAdmin(address admin) external onlyOwner {
        insurerAdmin = admin;
        emit InsurerAdminUpdated(admin);
    }

    /// @notice Set or revoke premium depositor authorization. Only owner.
    function setAuthorizedPremiumDepositor(address depositor, bool authorized) external onlyOwner {
        authorizedPremiumDepositors[depositor] = authorized;
        emit PremiumDepositorUpdated(depositor, authorized);
    }

    // --- Fee Management ---

    /// @notice Withdraw accumulated fees to a recipient. Only owner.
    /// @param recipient Address to receive the fees
    function claimFees(address recipient) external onlyOwner {
        _accrueFeesInternal();

        uint256 fees = accumulatedFees;
        if (fees == 0) revert InsuranceVault__NoFeesToClaim();

        accumulatedFees = 0;

        IERC20(asset()).safeTransfer(recipient, fees);

        emit FeesCollected(recipient, fees);
    }

    // --- Frontend View Helpers ---

    /// @notice Aggregated vault info for frontend (reduces RPC calls).
    function getVaultInfo() external view returns (
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
    ) {
        uint256 totalShares = totalSupply();
        uint256 totalAssetsVal = totalAssets();

        // sharePrice in USDC decimals (6 decimals precision)
        // If no shares, price is 1:1 (1e6 = $1.00)
        uint256 price = totalShares > 0
            ? (totalAssetsVal * 1e18) / totalShares
            : 1e6;

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
    function getVaultPolicy(uint256 policyId) external view returns (
        uint256 allocationWeight,
        uint256 premium,
        uint256 earnedPremium,
        uint256 coverage,
        uint256 duration,
        uint256 startTime,
        uint256 timeRemaining,
        bool claimed,
        bool expired
    ) {
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

    // --- Internal Helpers ---

    /// @dev Validate common claim preconditions. Returns storage pointer to vault policy.
    function _validateClaimPreconditions(uint256 policyId) internal view returns (VaultPolicy storage) {
        if (!policyAdded[policyId]) revert InsuranceVault__PolicyNotInVault(policyId);

        VaultPolicy storage vp = vaultPolicies[policyId];
        if (vp.claimed) revert InsuranceVault__PolicyAlreadyClaimed(policyId);

        // Check policy is still active (not expired)
        PolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (policy.status != PolicyRegistry.PolicyStatus.ACTIVE) {
            revert InsuranceVault__PolicyNotActive(policyId);
        }

        // Check not expired via virtual time
        if (registry.isPolicyExpired(policyId)) {
            revert InsuranceVault__PolicyNotActive(policyId);
        }

        return vp;
    }

    /// @dev Process a claim: update state, mint receipt, attempt auto-exercise.
    ///      If vault has sufficient USDC, auto-exercises in the same tx.
    ///      Otherwise defers to manual exerciseClaim() (receipt stays live).
    function _processClaim(uint256 policyId, uint256 amount, address insurer) internal {
        _accrueFeesInternal();

        VaultPolicy storage vp = vaultPolicies[policyId];
        vp.claimed = true;
        vp.claimAmount = amount;

        totalPendingClaims += amount;

        // Mint ClaimReceipt to insurer
        uint256 receiptId = claimReceipt.mint(insurer, policyId, amount, address(this));

        emit ClaimTriggered(policyId, amount, insurer, receiptId);

        // --- Auto-exercise if vault has sufficient funds ---
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        if (balance >= amount) {
            // Sufficient funds: auto-exercise in same tx
            totalPendingClaims -= amount;

            // Reduce deployed capital (floor at 0)
            if (amount >= totalDeployedCapital) {
                totalDeployedCapital = 0;
            } else {
                totalDeployedCapital -= amount;
            }

            // Mark exercised on ClaimReceipt (sets exercised=true AND burns NFT)
            claimReceipt.markExercised(receiptId);

            // Transfer USDC to insurer
            IERC20(asset()).safeTransfer(insurer, amount);

            emit ClaimAutoExercised(receiptId, amount, insurer);
        } else {
            // Shortfall: defer to manual exerciseClaim()
            emit ClaimShortfall(receiptId, amount, balance);
        }
    }

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

        return total;
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
    ///      buffer = balance - deployed - pendingClaims
    function _availableBuffer() internal view returns (uint256) {
        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 reserved = totalDeployedCapital + totalPendingClaims;
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
