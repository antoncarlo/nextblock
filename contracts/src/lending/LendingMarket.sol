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

    // --- Supply book ---
    uint256 public totalSupplyAssets;
    uint256 public totalSupplyShares;
    mapping(address => uint256) public supplyShares;

    // --- Accrual ---
    uint64 public lastAccrued;

    // --- Events ---
    event Supply(address indexed lender, uint256 assets, uint256 shares);
    event Withdraw(address indexed lender, address indexed to, uint256 assets, uint256 shares);

    // --- Errors ---
    error LendingMarket__InvalidParams();
    error LendingMarket__ZeroAmount();
    error LendingMarket__NotWhitelisted(address account);
    error LendingMarket__SupplyCapExceeded(uint256 cap);
    error LendingMarket__InsufficientShares();

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

        lastAccrued = uint64(block.timestamp);
    }

    // --- Interest accrual (no-op until borrows exist; IRM added in borrow slice) ---
    function _accrue() internal {
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

        supplyShares[msg.sender] -= shares;
        totalSupplyShares -= shares;
        totalSupplyAssets -= assets;

        loanToken.safeTransfer(to, assets);
        emit Withdraw(msg.sender, to, assets, shares);
    }
}
