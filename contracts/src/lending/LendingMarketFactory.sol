// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "../ProtocolRoles.sol";
import {NavShareOracle} from "./NavShareOracle.sol";
import {LendingMarket} from "./LendingMarket.sol";

/// @title LendingMarketFactory
/// @author Anton Carlo Santoro
/// @notice Deploys and tracks permissioned isolated LendingMarket instances, one
///         per collateral vault, each with its own NavShareOracle bound to the
///         shared global NavOracle. Infrastructure addresses (USDC loan asset,
///         NavOracle, ProtocolRoles, ComplianceRegistry) are set once and shared.
///
///         Permissioned: only UNDERWRITING_CURATOR_ROLE may create a market.
///
///         IMPORTANT (role separation): the factory does NOT approve the new
///         market as a custody venue. A market can only custody `nbUSDC` once the
///         KYC Operator calls `ComplianceRegistry.setApprovedVenue(market, true)` —
///         a separate, explicitly authorized governance act.
contract LendingMarketFactory is ProtocolRoleConstants {
    // --- Immutables (shared infrastructure) ---
    address public immutable loanToken; // USDC
    address public immutable navOracle; // global NavOracle attestation store
    ProtocolRoles public immutable protocolRoles;
    address public immutable compliance; // ComplianceRegistry

    // --- State ---
    address[] public deployedMarkets;
    mapping(address => bool) public isMarket;

    /// @notice Per-market creation parameters (struct to stay stack-safe).
    struct CreateParams {
        address collateralVault; // nbUSDC vault used as collateral
        uint256 lltvBps;
        uint256 liqLtvBps;
        uint256 liqIncentiveBps;
        uint256 protocolFeeBps;
        uint256 supplyCap;
        uint256 borrowCap;
        address feeRecipient;
        uint256 baseRatePerSecondWad;
        uint256 slopePerSecondWad;
    }

    // --- Events ---
    event MarketCreated(
        address indexed market, address indexed collateralVault, address oracle, address indexed createdBy
    );

    // --- Errors ---
    error LendingMarketFactory__InvalidParams();
    error LendingMarketFactory__UnauthorizedRole(address caller, bytes32 role);

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert LendingMarketFactory__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(address loanToken_, address navOracle_, address protocolRoles_, address compliance_) {
        if (
            loanToken_ == address(0) || navOracle_ == address(0) || protocolRoles_ == address(0)
                || compliance_ == address(0)
        ) {
            revert LendingMarketFactory__InvalidParams();
        }
        loanToken = loanToken_;
        navOracle = navOracle_;
        protocolRoles = ProtocolRoles(protocolRoles_);
        compliance = compliance_;
    }

    /// @notice Deploy a NavShareOracle + LendingMarket for `p.collateralVault`.
    ///         Caller must hold UNDERWRITING_CURATOR_ROLE. Risk-parameter validity
    ///         is enforced by the LendingMarket constructor (reverts propagate).
    /// @return market Address of the newly deployed LendingMarket.
    function createMarket(CreateParams calldata p)
        external
        onlyProtocolRole(UNDERWRITING_CURATOR_ROLE)
        returns (address market)
    {
        if (p.collateralVault == address(0)) {
            revert LendingMarketFactory__InvalidParams();
        }

        NavShareOracle oracle = new NavShareOracle(navOracle, p.collateralVault);

        LendingMarket m = new LendingMarket(
            LendingMarket.MarketParams({
                loanToken: loanToken,
                collateralToken: p.collateralVault,
                oracle: address(oracle),
                protocolRoles: address(protocolRoles),
                compliance: compliance,
                lltvBps: p.lltvBps,
                liqLtvBps: p.liqLtvBps,
                liqIncentiveBps: p.liqIncentiveBps,
                protocolFeeBps: p.protocolFeeBps,
                supplyCap: p.supplyCap,
                borrowCap: p.borrowCap,
                feeRecipient: p.feeRecipient,
                baseRatePerSecondWad: p.baseRatePerSecondWad,
                slopePerSecondWad: p.slopePerSecondWad
            })
        );

        market = address(m);
        deployedMarkets.push(market);
        isMarket[market] = true;

        emit MarketCreated(market, p.collateralVault, address(oracle), msg.sender);
    }

    /// @notice All deployed market addresses.
    function getMarkets() external view returns (address[] memory) {
        return deployedMarkets;
    }

    /// @notice Number of deployed markets.
    function getMarketCount() external view returns (uint256) {
        return deployedMarkets.length;
    }
}
