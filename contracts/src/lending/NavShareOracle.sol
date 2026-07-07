// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {NavOracle} from "../NavOracle.sol";

/// @title NavShareOracle
/// @author Anton Carlo Santoro
/// @notice Pure read adapter that prices restricted `nbUSDC` vault shares in USDC,
///         for permissioned collateral venues (e.g., the LendingMarket).
///
///         Price source is the guarded NavOracle attestation, NOT raw ERC-4626
///         conversion: `getNav` reverts when the NAV is missing, stale or paused,
///         so a consuming market freezes risk-increasing actions automatically.
///
///         Decimals: `nbUSDC` shares are 18-dec (vault `_decimalsOffset()=12` over
///         6-dec USDC), NAV is 6-dec USDC. Collateral value therefore is
///         `shares(1e18) * nav(1e6) / totalSupply(1e18) = USDC(1e6)`. Rounded down
///         (conservative: never over-values collateral).
///
///         Holds NO funds and has NO privileged functions.
contract NavShareOracle {
    /// @notice Guarded NAV attestation source (Braino.ai/WAVENURE mock feed).
    NavOracle public immutable navOracle;

    /// @notice The InsuranceVault whose `nbUSDC` shares are priced (the ERC-20 share token).
    address public immutable vault;

    /// @notice One whole share unit (nbUSDC is 18-dec).
    uint256 public constant SHARE_UNIT = 1e18;

    /// @notice Zero address/value or otherwise malformed parameters.
    error NavShareOracle__InvalidParams();
    /// @notice Vault has zero share supply - NAV per share is undefined.
    error NavShareOracle__NoSupply();

    /// @notice Binds the NAV attestation store and the vault whose shares are priced.
    constructor(address navOracle_, address vault_) {
        if (navOracle_ == address(0) || vault_ == address(0)) revert NavShareOracle__InvalidParams();
        navOracle = NavOracle(navOracle_);
        vault = vault_;
    }

    /// @notice USDC (6-dec) value of `shares` (18-dec nbUSDC).
    /// @dev Reverts `NavShareOracle__NoSupply` if the vault has no shares, and
    ///      propagates NavOracle reverts (missing/stale/paused NAV). Rounds down.
    function priceCollateralUSDC(uint256 shares) public view returns (uint256) {
        uint256 supply = IERC20(vault).totalSupply();
        if (supply == 0) revert NavShareOracle__NoSupply();
        // Partial destructuring is deliberate: staleness/confidence are re-checked here.
        // slither-disable-next-line unused-return
        (uint256 nav,,) = navOracle.getNav(vault);
        return Math.mulDiv(shares, nav, supply);
    }

    /// @notice Non-reverting variant for frontend/indexer reads.
    /// @return ok True only if a fresh, live NAV exists and the vault has supply.
    /// @return value Collateral USDC value when `ok`, else 0.
    function tryPriceCollateralUSDC(uint256 shares) external view returns (bool ok, uint256 value) {
        uint256 supply = IERC20(vault).totalSupply();
        (bool valid, NavOracle.NavAttestation memory att) = navOracle.tryGetNav(vault);
        if (!valid || supply == 0) return (false, 0);
        return (true, Math.mulDiv(shares, att.nav, supply));
    }

    /// @notice USDC (6-dec) value of one whole nbUSDC share.
    function navPerShare() external view returns (uint256) {
        return priceCollateralUSDC(SHARE_UNIT);
    }
}
