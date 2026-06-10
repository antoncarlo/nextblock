// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";
import {InsuranceVault} from "./InsuranceVault.sol";

/// @title PremiumDistributor
/// @author Anton Carlo Santoro
/// @notice Receives ceded premium USDC from authorized cedants and distributes it
///         according to a documented, parametric split:
///           - LP quota        -> forwarded atomically to the portfolio's vault
///                                (enters UPR, earned over the coverage window)
///           - protocol fee    -> accrued here, claimable by OWNER_ROLE (pull pattern)
///           - underwriting fee-> accrued here, claimable by OWNER_ROLE (pull pattern)
///         Single-vault-per-portfolio for MVP; the portfolioVault mapping is the
///         extension point for multi-vault splits (Phase 6 VaultAllocator).
/// @dev Conservation invariant: gross == lpQuota + protocolFee + underwritingFee
///      for every receipt, and address(this) USDC balance always equals
///      accruedProtocolFees + accruedUnderwritingFees (LP quota never parks here).
///      Fee rounding is UP (protocol liability convention); rounding dust therefore
///      reduces the LP quota, never inflates it. No claim settlement, NAV oracle
///      or AI assessor logic lives here.
contract PremiumDistributor is ProtocolRoleConstants, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Constants (documented split bounds; no magic numbers) ---
    uint256 public constant BASIS_POINTS = 10_000;

    /// @notice Hard cap for the protocol fee: 5%.
    uint256 public constant MAX_PROTOCOL_FEE_BPS = 500;

    /// @notice Hard cap for the underwriting (curator/syndicate) fee: 20%.
    uint256 public constant MAX_UNDERWRITING_FEE_BPS = 2_000;

    /// @notice Default protocol fee: 1.5% (NextBlock brief).
    uint256 public constant DEFAULT_PROTOCOL_FEE_BPS = 150;

    /// @notice Default underwriting fee: 10%.
    uint256 public constant DEFAULT_UNDERWRITING_FEE_BPS = 1_000;

    // --- References ---
    IERC20 public immutable usdc;
    ProtocolRoles public immutable protocolRoles;
    PortfolioRegistry public immutable portfolioRegistry;

    // --- Split configuration ---
    uint256 public protocolFeeBps;
    uint256 public underwritingFeeBps;

    // --- Routing ---
    /// @notice Vault funded by each portfolio's premiums (single vault per portfolio in MVP).
    mapping(uint256 => address) public portfolioVault;

    // --- Accounting ---
    struct PremiumAccounting {
        uint256 gross; // total premium received for the portfolio
        uint256 lpQuota; // forwarded to the vault
        uint256 protocolFees; // accrued protocol fees
        uint256 underwritingFees; // accrued underwriting fees
    }

    mapping(uint256 => PremiumAccounting) public premiumAccounting;

    uint256 public accruedProtocolFees;
    uint256 public accruedUnderwritingFees;
    uint256 public totalGrossReceived;

    // --- Events ---
    event PremiumReceived(uint256 indexed portfolioId, address indexed from, uint256 grossAmount);
    event PremiumAllocated(uint256 indexed portfolioId, address indexed vault, uint256 lpQuota);
    event ProtocolFeeAccrued(uint256 indexed portfolioId, uint256 amount);
    event UnderwritingFeeAccrued(uint256 indexed portfolioId, uint256 amount);
    event ProtocolFeesClaimed(address indexed recipient, uint256 amount);
    event UnderwritingFeesClaimed(address indexed recipient, uint256 amount);
    event PremiumSplitUpdated(uint256 protocolFeeBps, uint256 underwritingFeeBps);
    event PortfolioVaultSet(uint256 indexed portfolioId, address indexed vault);

    // --- Errors ---
    error PremiumDistributor__UnauthorizedRole(address caller, bytes32 role);
    error PremiumDistributor__UnauthorizedPremiumSource(address caller);
    error PremiumDistributor__InvalidParams();
    error PremiumDistributor__FeeAboveMax(uint256 requestedBps, uint256 maxBps);
    error PremiumDistributor__VaultNotSet(uint256 portfolioId);
    error PremiumDistributor__PortfolioNotAllocatable(uint256 portfolioId);
    error PremiumDistributor__VaultChangeAfterFunding(uint256 portfolioId);
    error PremiumDistributor__NothingToClaim();

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert PremiumDistributor__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(address usdc_, address protocolRoles_, address portfolioRegistry_) {
        if (usdc_ == address(0) || protocolRoles_ == address(0) || portfolioRegistry_ == address(0)) {
            revert PremiumDistributor__InvalidParams();
        }
        usdc = IERC20(usdc_);
        protocolRoles = ProtocolRoles(protocolRoles_);
        portfolioRegistry = PortfolioRegistry(portfolioRegistry_);

        protocolFeeBps = DEFAULT_PROTOCOL_FEE_BPS;
        underwritingFeeBps = DEFAULT_UNDERWRITING_FEE_BPS;
        emit PremiumSplitUpdated(DEFAULT_PROTOCOL_FEE_BPS, DEFAULT_UNDERWRITING_FEE_BPS);
    }

    // --- Configuration ---

    /// @notice Update the premium split. Only OWNER_ROLE, bounded by the documented caps.
    function setPremiumSplit(uint256 protocolFeeBps_, uint256 underwritingFeeBps_)
        external
        onlyProtocolRole(OWNER_ROLE)
    {
        if (protocolFeeBps_ > MAX_PROTOCOL_FEE_BPS) {
            revert PremiumDistributor__FeeAboveMax(protocolFeeBps_, MAX_PROTOCOL_FEE_BPS);
        }
        if (underwritingFeeBps_ > MAX_UNDERWRITING_FEE_BPS) {
            revert PremiumDistributor__FeeAboveMax(underwritingFeeBps_, MAX_UNDERWRITING_FEE_BPS);
        }
        protocolFeeBps = protocolFeeBps_;
        underwritingFeeBps = underwritingFeeBps_;
        emit PremiumSplitUpdated(protocolFeeBps_, underwritingFeeBps_);
    }

    /// @notice Bind a portfolio to the vault that will receive its LP quota.
    ///         Only UNDERWRITING_CURATOR_ROLE. Immutable once the portfolio has
    ///         received premiums (prevents split-brain accounting).
    function setPortfolioVault(uint256 portfolioId, address vault)
        external
        onlyProtocolRole(UNDERWRITING_CURATOR_ROLE)
    {
        if (vault == address(0)) revert PremiumDistributor__InvalidParams();
        // Reverts if the portfolio does not exist.
        portfolioRegistry.getPortfolio(portfolioId);
        if (premiumAccounting[portfolioId].gross != 0) {
            revert PremiumDistributor__VaultChangeAfterFunding(portfolioId);
        }
        portfolioVault[portfolioId] = vault;
        emit PortfolioVaultSet(portfolioId, vault);
    }

    // --- Premium Flow ---

    /// @notice Receive a ceded premium and distribute it according to the split.
    ///         Caller must hold AUTHORIZED_CEDANT_ROLE or PREMIUM_DEPOSITOR_ROLE
    ///         and must have approved this contract for `grossAmount` USDC.
    /// @param portfolioId Portfolio the premium belongs to (must be APPROVED/ACTIVE)
    /// @param grossAmount Gross premium in USDC (6 decimals)
    function receivePremium(uint256 portfolioId, uint256 grossAmount) external nonReentrant {
        if (
            !protocolRoles.hasRole(AUTHORIZED_CEDANT_ROLE, msg.sender)
                && !protocolRoles.hasRole(PREMIUM_DEPOSITOR_ROLE, msg.sender)
        ) {
            revert PremiumDistributor__UnauthorizedPremiumSource(msg.sender);
        }
        if (grossAmount == 0) revert PremiumDistributor__InvalidParams();

        address vault = portfolioVault[portfolioId];
        if (vault == address(0)) revert PremiumDistributor__VaultNotSet(portfolioId);
        if (!portfolioRegistry.isAllocatable(portfolioId)) {
            revert PremiumDistributor__PortfolioNotAllocatable(portfolioId);
        }

        // Pull the gross premium.
        usdc.safeTransferFrom(msg.sender, address(this), grossAmount);
        emit PremiumReceived(portfolioId, msg.sender, grossAmount);

        // Split. Fees round UP (protocol liability convention); dust shrinks the
        // LP quota so the caller can never gain from rounding. For dust-sized
        // premiums the fees are capped sequentially at the remaining gross, so
        // the split can never underflow (fees may consume 100% of a dust premium).
        (uint256 lpQuota, uint256 protocolFee, uint256 underwritingFee) = _split(grossAmount);

        // Accrue fees (pull pattern).
        accruedProtocolFees += protocolFee;
        accruedUnderwritingFees += underwritingFee;

        // Book per-portfolio accounting.
        PremiumAccounting storage acc = premiumAccounting[portfolioId];
        acc.gross += grossAmount;
        acc.lpQuota += lpQuota;
        acc.protocolFees += protocolFee;
        acc.underwritingFees += underwritingFee;
        totalGrossReceived += grossAmount;

        emit ProtocolFeeAccrued(portfolioId, protocolFee);
        emit UnderwritingFeeAccrued(portfolioId, underwritingFee);

        // Forward the LP quota to the vault (enters UPR there).
        if (lpQuota > 0) {
            usdc.forceApprove(vault, lpQuota);
            InsuranceVault(vault).recordPortfolioPremium(portfolioId, lpQuota);
            emit PremiumAllocated(portfolioId, vault, lpQuota);
        }
    }

    // --- Fee Claims (pull pattern) ---

    /// @notice Transfer accrued protocol fees to `recipient`. Only OWNER_ROLE.
    function claimProtocolFees(address recipient) external onlyProtocolRole(OWNER_ROLE) nonReentrant {
        if (recipient == address(0)) revert PremiumDistributor__InvalidParams();
        uint256 amount = accruedProtocolFees;
        if (amount == 0) revert PremiumDistributor__NothingToClaim();
        accruedProtocolFees = 0;
        usdc.safeTransfer(recipient, amount);
        emit ProtocolFeesClaimed(recipient, amount);
    }

    /// @notice Transfer accrued underwriting fees to `recipient`. Only OWNER_ROLE.
    function claimUnderwritingFees(address recipient) external onlyProtocolRole(OWNER_ROLE) nonReentrant {
        if (recipient == address(0)) revert PremiumDistributor__InvalidParams();
        uint256 amount = accruedUnderwritingFees;
        if (amount == 0) revert PremiumDistributor__NothingToClaim();
        accruedUnderwritingFees = 0;
        usdc.safeTransfer(recipient, amount);
        emit UnderwritingFeesClaimed(recipient, amount);
    }

    // --- Views ---

    /// @notice Per-portfolio premium accounting breakdown.
    function getPremiumAccounting(uint256 portfolioId) external view returns (PremiumAccounting memory) {
        return premiumAccounting[portfolioId];
    }

    /// @notice Preview the split for a gross amount under the current configuration.
    function previewSplit(uint256 grossAmount)
        external
        view
        returns (uint256 lpQuota, uint256 protocolFee, uint256 underwritingFee)
    {
        return _split(grossAmount);
    }

    /// @dev Fee-first split with sequential capping: protocol fee first, then
    ///      underwriting fee on the remainder cap, then LP quota. Guarantees
    ///      lpQuota + protocolFee + underwritingFee == grossAmount for any input.
    function _split(uint256 grossAmount)
        internal
        view
        returns (uint256 lpQuota, uint256 protocolFee, uint256 underwritingFee)
    {
        protocolFee = Math.mulDiv(grossAmount, protocolFeeBps, BASIS_POINTS, Math.Rounding.Ceil);
        if (protocolFee > grossAmount) protocolFee = grossAmount;

        uint256 remaining = grossAmount - protocolFee;
        underwritingFee = Math.mulDiv(grossAmount, underwritingFeeBps, BASIS_POINTS, Math.Rounding.Ceil);
        if (underwritingFee > remaining) underwritingFee = remaining;

        lpQuota = remaining - underwritingFee;
    }
}
