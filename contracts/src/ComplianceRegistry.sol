// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title IComplianceRegistry
/// @notice Stable interface consumed by InsuranceVault (Phase 3) for nbUSDC
///         transfer hooks, deposit gating and redemption gating.
interface IComplianceRegistry {
    function canReceive(address user) external view returns (bool);
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
    function requireCanReceive(address user) external view;
    function requireCanTransfer(address from, address to, uint256 amount) external view;
    function isBlocked(address user) external view returns (bool);
    function investorLimit(address user) external view returns (uint256);
    function approvedVenue(address venue) external view returns (bool);
}

/// @title ComplianceRegistry
/// @author Anton Carlo Santoro
/// @notice ERC-3643-style mock compliance registry for the NextBlock MVP.
///         Single source of truth for LP/cedant transfer eligibility: whitelist,
///         block flags (sanctions/freeze), jurisdiction codes, KYC expiry and
///         optional per-investor exposure limits. Holds NO funds and contains
///         NO vault business logic.
/// @dev Eligibility rule: an address can receive restricted shares (nbUSDC) only
///      if it is whitelisted, not blocked, and its KYC has not expired.
///      Burns (to == address(0)) are allowed when the sender is not blocked, so
///      compliant redemptions remain possible after a whitelist downgrade.
///      investorLimit is informational here; enforcement happens in the vault
///      (Phase 3 — Vault Hardening).
contract ComplianceRegistry is ProtocolRoleConstants, IComplianceRegistry {
    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice True if the address may hold restricted vault shares.
    mapping(address => bool) public whitelisted;

    /// @notice True if the address is blocked (sanctions, freeze, incident).
    ///         Blocked addresses can neither send nor receive.
    mapping(address => bool) public blocked;

    /// @notice ISO-3166-like numeric jurisdiction code (0 = unset).
    mapping(address => uint16) public jurisdictionCode;

    /// @notice Unix timestamp at which the KYC verification expires.
    mapping(address => uint64) public kycExpiry;

    /// @notice Optional max exposure per institutional LP in USDC (0 = unlimited).
    ///         Enforced by the vault in Phase 3, stored here as compliance datum.
    mapping(address => uint256) private _investorLimit;

    /// @notice True if the address is an approved on-chain venue allowed to custody
    ///         restricted shares (e.g., a permissioned LendingMarket). A contract
    ///         venue has no KYC to expire, so it is exempt from the whitelist/kycExpiry
    ///         checks, but the `blocked` flag still applies (Sentinel can revoke it).
    mapping(address => bool) public approvedVenue;

    // --- Events ---
    event WhitelistUpdated(address indexed user, bool allowed);
    event BlockedStatusUpdated(address indexed user, bool blocked);
    event JurisdictionUpdated(address indexed user, uint16 code);
    event KycExpiryUpdated(address indexed user, uint64 expiry);
    event InvestorLimitUpdated(address indexed user, uint256 limit);
    event ApprovedVenueUpdated(address indexed venue, bool approved);

    // --- Errors ---
    error ComplianceRegistry__UnauthorizedRole(address caller, bytes32 role);
    error ComplianceRegistry__InvalidParams();
    error ComplianceRegistry__ReceiverNotWhitelisted(address user);
    error ComplianceRegistry__AddressBlocked(address user);
    error ComplianceRegistry__KycExpired(address user, uint64 expiry);

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert ComplianceRegistry__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    /// @param protocolRoles_ Address of the deployed ProtocolRoles access manager.
    constructor(address protocolRoles_) {
        if (protocolRoles_ == address(0)) revert ComplianceRegistry__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
    }

    // --- KYC Operator Actions ---

    /// @notice Add or remove an address from the whitelist. Only KYC_OPERATOR_ROLE.
    function setWhitelist(address user, bool allowed) external onlyProtocolRole(KYC_OPERATOR_ROLE) {
        if (user == address(0)) revert ComplianceRegistry__InvalidParams();
        whitelisted[user] = allowed;
        emit WhitelistUpdated(user, allowed);
    }

    /// @notice Set the jurisdiction code for an address. Only KYC_OPERATOR_ROLE.
    function setJurisdiction(address user, uint16 code) external onlyProtocolRole(KYC_OPERATOR_ROLE) {
        if (user == address(0)) revert ComplianceRegistry__InvalidParams();
        jurisdictionCode[user] = code;
        emit JurisdictionUpdated(user, code);
    }

    /// @notice Set the KYC expiry timestamp for an address. Only KYC_OPERATOR_ROLE.
    function setKycExpiry(address user, uint64 expiry) external onlyProtocolRole(KYC_OPERATOR_ROLE) {
        if (user == address(0)) revert ComplianceRegistry__InvalidParams();
        kycExpiry[user] = expiry;
        emit KycExpiryUpdated(user, expiry);
    }

    /// @notice Set the optional investor exposure limit (0 = unlimited).
    ///         Only KYC_OPERATOR_ROLE. Enforcement is the vault's duty (Phase 3).
    function setInvestorLimit(address user, uint256 limit) external onlyProtocolRole(KYC_OPERATOR_ROLE) {
        if (user == address(0)) revert ComplianceRegistry__InvalidParams();
        _investorLimit[user] = limit;
        emit InvestorLimitUpdated(user, limit);
    }

    /// @notice Approve or revoke an on-chain venue authorized to custody restricted
    ///         shares (permissioned composability, e.g. a LendingMarket). Only
    ///         KYC_OPERATOR_ROLE. Revocation of risk is also possible via setBlocked.
    function setApprovedVenue(address venue, bool approved) external onlyProtocolRole(KYC_OPERATOR_ROLE) {
        if (venue == address(0)) revert ComplianceRegistry__InvalidParams();
        approvedVenue[venue] = approved;
        emit ApprovedVenueUpdated(venue, approved);
    }

    // --- Sentinel Actions ---

    /// @notice Block or unblock an address (sanctions/freeze/incident response).
    ///         Only SENTINEL_ROLE. A risk-reduction power: cannot move funds.
    function setBlocked(address user, bool blocked_) external onlyProtocolRole(SENTINEL_ROLE) {
        if (user == address(0)) revert ComplianceRegistry__InvalidParams();
        blocked[user] = blocked_;
        emit BlockedStatusUpdated(user, blocked_);
    }

    // --- Eligibility Views (stable interface for Phase 3 vault) ---

    /// @inheritdoc IComplianceRegistry
    function canReceive(address user) public view returns (bool) {
        if (blocked[user]) return false;
        if (approvedVenue[user]) return true; // approved venue: exempt from whitelist/kycExpiry
        if (!whitelisted[user]) return false;
        if (kycExpiry[user] < uint64(block.timestamp)) return false;
        return true;
    }

    /// @inheritdoc IComplianceRegistry
    /// @dev Burn path (to == address(0)) requires only a non-blocked sender, so a
    ///      de-whitelisted LP can still exit compliantly. Mint path (from ==
    ///      address(0)) requires an eligible receiver. `amount` is reserved for
    ///      future jurisdiction/limit rules and is intentionally unused in MVP.
    function canTransfer(address from, address to, uint256 amount) public view returns (bool) {
        amount; // silence unused warning; reserved for future rules
        if (from != address(0) && blocked[from]) return false;
        if (to == address(0)) return true; // burn/redemption path
        return canReceive(to);
    }

    /// @inheritdoc IComplianceRegistry
    /// @dev Same checks as canReceive but reverts with the specific cause,
    ///      so vault transfer hooks surface actionable compliance errors.
    function requireCanReceive(address user) public view {
        if (blocked[user]) revert ComplianceRegistry__AddressBlocked(user);
        if (approvedVenue[user]) return; // approved venue: exempt from whitelist/kycExpiry
        if (!whitelisted[user]) revert ComplianceRegistry__ReceiverNotWhitelisted(user);
        uint64 expiry = kycExpiry[user];
        if (expiry < uint64(block.timestamp)) revert ComplianceRegistry__KycExpired(user, expiry);
    }

    /// @inheritdoc IComplianceRegistry
    function requireCanTransfer(address from, address to, uint256 amount) external view {
        amount; // reserved for future rules
        if (from != address(0) && blocked[from]) revert ComplianceRegistry__AddressBlocked(from);
        if (to == address(0)) return; // burn/redemption path
        requireCanReceive(to);
    }

    /// @inheritdoc IComplianceRegistry
    function isBlocked(address user) external view returns (bool) {
        return blocked[user];
    }

    /// @inheritdoc IComplianceRegistry
    function investorLimit(address user) external view returns (uint256) {
        return _investorLimit[user];
    }
}
