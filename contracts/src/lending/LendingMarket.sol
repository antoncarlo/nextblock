// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ProtocolRoles} from "../ProtocolRoles.sol";
import {IComplianceRegistry} from "../ComplianceRegistry.sol";
import {NavShareOracle} from "./NavShareOracle.sol";

/// @title LendingMarket
/// @author Anton Carlo Santoro
/// @notice Isolated, permissioned lending market in Morpho-Blue grammar: one
///         collateral asset (`nbUSDC` shares of one InsuranceVault) and one loan
///         asset (USDC). Whitelisted institutional lenders supply USDC and earn
///         interest; whitelisted holders post `nbUSDC` collateral and borrow USDC.
///
///         The market must be registered as an `approvedVenue` in the
///         ComplianceRegistry so it can custody restricted shares. It holds NO
///         power over the InsuranceVault: it only custodies shares and reads NAV.
///
///         Slice 1 (this revision): lender side — supply/withdraw USDC with
///         virtual-share accounting (first-depositor inflation protection),
///         compliance gate and supply cap. Collateral, borrow, interest accrual
///         and liquidation are added in subsequent slices.
contract LendingMarket {
    using SafeERC20 for IERC20;

    // --- Constants ---
    uint256 internal constant MAX_BPS = 10_000;
    /// @dev Virtual shares/assets offset (Morpho-style) to neutralize the
    ///      first-depositor share-inflation attack on the supply book.
    uint256 internal constant VIRTUAL_SHARES = 1e6;
    uint256 internal constant VIRTUAL_ASSETS = 1;
    uint256 internal constant WAD = 1e18;

    // --- Construction params ---
    struct MarketParams {
        address loanToken; // USDC
        address collateralToken; // nbUSDC vault (ERC-4626 share token)
        address oracle; // NavShareOracle
        address protocolRoles; // central RBAC
        address compliance; // ComplianceRegistry
        uint256 lltvBps; // max loan-to-value for borrowing
        uint256 liqLtvBps; // liquidation threshold (>= lltvBps)
        uint256 liqIncentiveBps; // liquidator bonus
        uint256 protocolFeeBps; // fee on accrued interest
        uint256 supplyCap; // 0 = unlimited
        uint256 borrowCap; // 0 = unlimited
        address feeRecipient; // protocol fee sink
        uint256 baseRatePerSecondWad; // IRM intercept (per-second, WAD)
        uint256 slopePerSecondWad; // IRM slope vs utilization (per-second, WAD)
    }

    // --- Immutables ---
    IERC20 public immutable loanToken;
    IERC20 public immutable collateralToken;
    NavShareOracle public immutable oracle;
    ProtocolRoles public immutable protocolRoles;
    IComplianceRegistry public immutable compliance;

    // --- Risk parameters ---
    uint256 public lltvBps;
    uint256 public liqLtvBps;
    uint256 public liqIncentiveBps;
    uint256 public protocolFeeBps;
    uint256 public supplyCap;
    uint256 public borrowCap;
    address public feeRecipient;
    uint256 public baseRatePerSecondWad;
    uint256 public slopePerSecondWad;

    // --- Supply book ---
    uint256 public totalSupplyAssets;
    uint256 public totalSupplyShares;
    mapping(address => uint256) public supplyShares;

    // --- Collateral book ---
    /// @notice nbUSDC collateral shares posted per borrower.
    mapping(address => uint256) public collateralOf;
    uint256 public totalCollateral;

    // --- Borrow book ---
    uint256 public totalBorrowAssets;
    uint256 public totalBorrowShares;
    mapping(address => uint256) public borrowShares;

    // --- Accrual ---
    uint64 public lastAccrued;

    // --- Events ---
    event Supply(address indexed lender, uint256 assets, uint256 shares);
    event Withdraw(address indexed lender, address indexed to, uint256 assets, uint256 shares);
    event CollateralDeposited(address indexed borrower, uint256 shares);
    event CollateralWithdrawn(address indexed borrower, address indexed to, uint256 shares);
    event Borrow(address indexed borrower, address indexed to, uint256 assets, uint256 shares);
    event Repay(address indexed borrower, uint256 assets, uint256 shares);
    event AccrueInterest(uint256 interest, uint256 feeShares);

    // --- Errors ---
    error LendingMarket__InvalidParams();
    error LendingMarket__ZeroAmount();
    error LendingMarket__NotWhitelisted(address account);
    error LendingMarket__SupplyCapExceeded(uint256 cap);
    error LendingMarket__InsufficientShares();
    error LendingMarket__InsufficientCollateral();
    error LendingMarket__HealthFactorTooLow();
    error LendingMarket__InsufficientLiquidity();
    error LendingMarket__BorrowCapExceeded(uint256 cap);
    error LendingMarket__NoDebt();

    constructor(MarketParams memory p) {
        if (
            p.loanToken == address(0) || p.collateralToken == address(0) || p.oracle == address(0)
                || p.protocolRoles == address(0) || p.compliance == address(0) || p.feeRecipient == address(0)
        ) {
            revert LendingMarket__InvalidParams();
        }
        if (
            p.lltvBps > p.liqLtvBps || p.liqLtvBps >= MAX_BPS || p.protocolFeeBps > MAX_BPS
                || p.liqIncentiveBps > MAX_BPS
        ) {
            revert LendingMarket__InvalidParams();
        }

        loanToken = IERC20(p.loanToken);
        collateralToken = IERC20(p.collateralToken);
        oracle = NavShareOracle(p.oracle);
        protocolRoles = ProtocolRoles(p.protocolRoles);
        compliance = IComplianceRegistry(p.compliance);

        lltvBps = p.lltvBps;
        liqLtvBps = p.liqLtvBps;
        liqIncentiveBps = p.liqIncentiveBps;
        protocolFeeBps = p.protocolFeeBps;
        supplyCap = p.supplyCap;
        borrowCap = p.borrowCap;
        feeRecipient = p.feeRecipient;
        baseRatePerSecondWad = p.baseRatePerSecondWad;
        slopePerSecondWad = p.slopePerSecondWad;

        lastAccrued = uint64(block.timestamp);
    }

    // --- Interest accrual (utilization-based linear IRM, simple interest per settle) ---
    function _accrue() internal {
        uint256 elapsed = block.timestamp - lastAccrued;
        if (elapsed == 0) return;

        uint256 borrowed = totalBorrowAssets;
        if (borrowed != 0 && totalSupplyAssets != 0) {
            uint256 util = Math.mulDiv(borrowed, WAD, totalSupplyAssets);
            uint256 ratePerSec = baseRatePerSecondWad + Math.mulDiv(slopePerSecondWad, util, WAD);
            uint256 interest = Math.mulDiv(borrowed, ratePerSec * elapsed, WAD);
            if (interest != 0) {
                totalBorrowAssets = borrowed + interest;
                totalSupplyAssets += interest;

                uint256 feeShares;
                if (protocolFeeBps != 0) {
                    uint256 feeAssets = Math.mulDiv(interest, protocolFeeBps, MAX_BPS);
                    if (feeAssets != 0) {
                        // Mint fee shares to the recipient (dilutes lenders by the fee).
                        feeShares = Math.mulDiv(
                            feeAssets,
                            totalSupplyShares + VIRTUAL_SHARES,
                            (totalSupplyAssets - feeAssets) + VIRTUAL_ASSETS
                        );
                        supplyShares[feeRecipient] += feeShares;
                        totalSupplyShares += feeShares;
                    }
                }
                emit AccrueInterest(interest, feeShares);
            }
        }
        lastAccrued = uint64(block.timestamp);
    }

    // --- Lender side ---

    /// @notice Supply USDC liquidity and receive supply shares. Lender must be a
    ///         compliant (whitelisted, non-blocked, KYC-valid) institutional LP.
    function supply(uint256 assets) external returns (uint256 shares) {
        if (assets == 0) revert LendingMarket__ZeroAmount();
        if (!compliance.canReceive(msg.sender)) revert LendingMarket__NotWhitelisted(msg.sender);
        _accrue();
        if (supplyCap != 0 && totalSupplyAssets + assets > supplyCap) {
            revert LendingMarket__SupplyCapExceeded(supplyCap);
        }
        shares = Math.mulDiv(assets, totalSupplyShares + VIRTUAL_SHARES, totalSupplyAssets + VIRTUAL_ASSETS);
        totalSupplyAssets += assets;
        totalSupplyShares += shares;
        supplyShares[msg.sender] += shares;

        loanToken.safeTransferFrom(msg.sender, address(this), assets);
        emit Supply(msg.sender, assets, shares);
    }

    /// @notice Withdraw `assets` USDC of supplied liquidity to `to`. Shares burned
    ///         are rounded up (favoring the protocol / remaining lenders).
    function withdraw(uint256 assets, address to) external returns (uint256 shares) {
        if (assets == 0) revert LendingMarket__ZeroAmount();
        if (to == address(0)) revert LendingMarket__InvalidParams();
        _accrue();
        shares = Math.mulDiv(
            assets, totalSupplyShares + VIRTUAL_SHARES, totalSupplyAssets + VIRTUAL_ASSETS, Math.Rounding.Ceil
        );
        if (shares > supplyShares[msg.sender]) revert LendingMarket__InsufficientShares();
        if (assets > totalSupplyAssets - totalBorrowAssets) revert LendingMarket__InsufficientLiquidity();

        supplyShares[msg.sender] -= shares;
        totalSupplyShares -= shares;
        totalSupplyAssets -= assets;

        loanToken.safeTransfer(to, assets);
        emit Withdraw(msg.sender, to, assets, shares);
    }

    // --- Collateral side ---

    /// @notice Post nbUSDC as collateral. The market must be an `approvedVenue` in
    ///         the ComplianceRegistry, otherwise the vault transfer hook reverts.
    function depositCollateral(uint256 shares) external {
        if (shares == 0) revert LendingMarket__ZeroAmount();
        if (!compliance.canReceive(msg.sender)) revert LendingMarket__NotWhitelisted(msg.sender);
        collateralOf[msg.sender] += shares;
        totalCollateral += shares;
        collateralToken.safeTransferFrom(msg.sender, address(this), shares);
        emit CollateralDeposited(msg.sender, shares);
    }

    /// @notice Withdraw posted collateral to `to`. The vault transfer hook enforces
    ///         that `to` is a compliant receiver. Borrow-health checks are added in
    ///         the borrow slice (no debt can exist yet).
    function withdrawCollateral(uint256 shares, address to) external {
        if (shares == 0) revert LendingMarket__ZeroAmount();
        if (to == address(0)) revert LendingMarket__InvalidParams();
        if (shares > collateralOf[msg.sender]) revert LendingMarket__InsufficientCollateral();
        _accrue();
        collateralOf[msg.sender] -= shares;
        totalCollateral -= shares;
        // Removing collateral must leave the position within the borrow LTV.
        if (!_isHealthy(msg.sender, lltvBps)) revert LendingMarket__HealthFactorTooLow();
        collateralToken.safeTransfer(to, shares);
        emit CollateralWithdrawn(msg.sender, to, shares);
    }

    // --- Borrow side ---

    /// @notice Borrow USDC against posted nbUSDC collateral. Borrower must be a
    ///         compliant LP; the position must stay within `lltvBps`. Reverts if
    ///         the NAV feed is stale/paused (collateral cannot be valued safely).
    function borrow(uint256 assets, address to) external returns (uint256 shares) {
        if (assets == 0) revert LendingMarket__ZeroAmount();
        if (to == address(0)) revert LendingMarket__InvalidParams();
        if (!compliance.canReceive(msg.sender)) revert LendingMarket__NotWhitelisted(msg.sender);
        _accrue();

        shares = Math.mulDiv(
            assets, totalBorrowShares + VIRTUAL_SHARES, totalBorrowAssets + VIRTUAL_ASSETS, Math.Rounding.Ceil
        );
        borrowShares[msg.sender] += shares;
        totalBorrowShares += shares;
        totalBorrowAssets += assets;

        if (borrowCap != 0 && totalBorrowAssets > borrowCap) revert LendingMarket__BorrowCapExceeded(borrowCap);
        if (totalBorrowAssets > totalSupplyAssets) revert LendingMarket__InsufficientLiquidity();
        if (!_isHealthy(msg.sender, lltvBps)) revert LendingMarket__HealthFactorTooLow();

        loanToken.safeTransfer(to, assets);
        emit Borrow(msg.sender, to, assets, shares);
    }

    /// @notice Repay outstanding USDC debt for the caller. Pass `type(uint256).max`
    ///         to repay in full. No compliance gate (exiting debt is always allowed).
    function repay(uint256 assets) external returns (uint256 shares) {
        if (assets == 0) revert LendingMarket__ZeroAmount();
        _accrue();
        uint256 debt = _borrowAssets(msg.sender);
        if (debt == 0) revert LendingMarket__NoDebt();

        uint256 pay;
        if (assets >= debt) {
            shares = borrowShares[msg.sender];
            pay = debt;
        } else {
            shares = Math.mulDiv(assets, totalBorrowShares + VIRTUAL_SHARES, totalBorrowAssets + VIRTUAL_ASSETS);
            pay = assets;
        }
        borrowShares[msg.sender] -= shares;
        totalBorrowShares -= shares;
        totalBorrowAssets -= pay;

        loanToken.safeTransferFrom(msg.sender, address(this), pay);
        emit Repay(msg.sender, pay, shares);
    }

    /// @notice Settle accrued interest. Permissionless (keeper-friendly).
    function accrue() external {
        _accrue();
    }

    // --- Views ---

    /// @notice Current USDC debt of `borrower` (rounded up).
    function borrowAssetsOf(address borrower) external view returns (uint256) {
        return _borrowAssets(borrower);
    }

    /// @notice True if `borrower` is within the borrow LTV (or has no debt).
    function isHealthy(address borrower) external view returns (bool) {
        return _isHealthy(borrower, lltvBps);
    }

    // --- Internal accounting ---

    function _borrowAssets(address borrower) internal view returns (uint256) {
        uint256 s = borrowShares[borrower];
        if (s == 0) return 0;
        return
            Math.mulDiv(s, totalBorrowAssets + VIRTUAL_ASSETS, totalBorrowShares + VIRTUAL_SHARES, Math.Rounding.Ceil);
    }

    /// @dev `ltvBps` is `lltvBps` for borrow/withdraw safety and `liqLtvBps` for
    ///      liquidation eligibility. Reads the guarded NAV oracle (reverts if stale).
    function _isHealthy(address borrower, uint256 ltvBps) internal view returns (bool) {
        uint256 debt = _borrowAssets(borrower);
        if (debt == 0) return true;
        uint256 maxDebt = Math.mulDiv(oracle.priceCollateralUSDC(collateralOf[borrower]), ltvBps, MAX_BPS);
        return debt <= maxDebt;
    }
}
