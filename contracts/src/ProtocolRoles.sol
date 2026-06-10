// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ProtocolRoleConstants
/// @author Anton Carlo Santoro
/// @notice Canonical NextBlock protocol role identifiers, shared by every
///         contract that gates functions through the central ProtocolRoles manager.
/// @dev Inherit this contract to reference role constants without external calls.
abstract contract ProtocolRoleConstants {
    /// @notice Protocol-level admin with limited, auditable powers.
    ///         Admin of every other role.
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");

    /// @notice Evaluates portfolios, approves risk terms, manages vault strategy
    ///         (Lloyd's-style Syndicate / Underwriting Curator).
    bytes32 public constant UNDERWRITING_CURATOR_ROLE = keccak256("UNDERWRITING_CURATOR_ROLE");

    /// @notice Distributes capacity across vaults and portfolios within approved limits.
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");

    /// @notice Pauses, challenges claims and responds to stale/deviating NAV.
    ///         May reduce risk but never move funds.
    bytes32 public constant SENTINEL_ROLE = keccak256("SENTINEL_ROLE");

    /// @notice Approves off-chain claims after AI assessment (committee path).
    bytes32 public constant CLAIMS_COMMITTEE_ROLE = keccak256("CLAIMS_COMMITTEE_ROLE");

    /// @notice Authorized to transfer premium USDC into vaults on behalf of cedants.
    bytes32 public constant PREMIUM_DEPOSITOR_ROLE = keccak256("PREMIUM_DEPOSITOR_ROLE");

    /// @notice Whitelisted reinsurer/ceding entity: submits portfolios and claims.
    bytes32 public constant AUTHORIZED_CEDANT_ROLE = keccak256("AUTHORIZED_CEDANT_ROLE");

    /// @notice Granted to VaultFactory instances allowed to deploy protocol vaults.
    bytes32 public constant VAULT_FACTORY_ROLE = keccak256("VAULT_FACTORY_ROLE");

    /// @notice Manages whitelist, jurisdiction flags, KYC expiry and transfer
    ///         eligibility. Cannot move funds.
    bytes32 public constant KYC_OPERATOR_ROLE = keccak256("KYC_OPERATOR_ROLE");

    /// @notice Publishes NAV, risk-score, bordereau and claim data attestations.
    ///         Cannot change business logic or move funds.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
}

/// @title ProtocolRoles
/// @author Anton Carlo Santoro
/// @notice Central on-chain access manager for the NextBlock protocol.
///         Single source of truth for role membership: VaultFactory, PolicyRegistry
///         and InsuranceVault query this contract instead of relying on Ownable
///         or frontend whitelists.
/// @dev OWNER_ROLE is the role admin for every operational role, so the protocol
///      owner can grant/revoke without holding DEFAULT_ADMIN_ROLE day-to-day.
contract ProtocolRoles is ProtocolRoleConstants, AccessControl {
    // --- Errors ---
    error ProtocolRoles__ZeroAddress();

    /// @param initialOwner Receives DEFAULT_ADMIN_ROLE and OWNER_ROLE.
    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ProtocolRoles__ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(OWNER_ROLE, initialOwner);

        // OWNER_ROLE administers all operational roles.
        _setRoleAdmin(UNDERWRITING_CURATOR_ROLE, OWNER_ROLE);
        _setRoleAdmin(ALLOCATOR_ROLE, OWNER_ROLE);
        _setRoleAdmin(SENTINEL_ROLE, OWNER_ROLE);
        _setRoleAdmin(CLAIMS_COMMITTEE_ROLE, OWNER_ROLE);
        _setRoleAdmin(PREMIUM_DEPOSITOR_ROLE, OWNER_ROLE);
        _setRoleAdmin(AUTHORIZED_CEDANT_ROLE, OWNER_ROLE);
        _setRoleAdmin(VAULT_FACTORY_ROLE, OWNER_ROLE);
        _setRoleAdmin(KYC_OPERATOR_ROLE, OWNER_ROLE);
        _setRoleAdmin(ORACLE_ROLE, OWNER_ROLE);
    }

    /// @notice Reverts with AccessControlUnauthorizedAccount if `account` lacks `role`.
    /// @dev Convenience hook for consumer contracts that prefer the standard
    ///      OZ error over a local custom error.
    function requireRole(bytes32 role, address account) external view {
        _checkRole(role, account);
    }
}
