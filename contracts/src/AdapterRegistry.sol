// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";

/// @title IRiskPoolAdapter
/// @notice Interface that future external risk-pool adapters (Ensuro, OnRe,
///         Nexus Mutual or similar markets) MUST implement to become allocatable.
/// @dev INTERFACE ONLY in the MVP: no adapter is integrated and no module calls
///      these functions yet. Future integrations must route exclusively through
///      the vault/allocator with caps — never through this registry.
interface IRiskPoolAdapter {
    /// @notice Allocate `amount` USDC of exposure toward `riskId`.
    function allocate(uint256 amount, bytes32 riskId) external returns (uint256 allocated);

    /// @notice Release `amount` USDC of exposure from `riskId`.
    function deallocate(uint256 amount, bytes32 riskId) external returns (uint256 released);

    /// @notice Current value of assets managed through the adapter.
    function realAssets() external view returns (uint256);
}

/// @title AdapterRegistry
/// @author Anton Carlo Santoro
/// @notice Allowlist registry of OPTIONAL external risk-pool adapters
///         (e.g., Ensuro, OnRe, Nexus Mutual) for the NextBlock protocol.
///
///         HARD BOUNDARIES (non-custodial, no core bypass):
///         - This registry holds NO funds, has NO transfer functions and NEVER
///           forwards calls to registered adapters: it stores addresses,
///           metadata, caps and status only.
///         - Registered adapters gain NO power over the core: they cannot touch
///           the vault, ComplianceRegistry, ClaimManager or PremiumDistributor.
///           Future allocations toward adapters must flow through the
///           VaultAllocator/vault path with their own caps and checks.
///         - Adapters are external counterparties, never hardcoded dependencies:
///           every entry can be disabled (Sentinel) or deprecated (Owner).
contract AdapterRegistry is ProtocolRoleConstants {
    // --- Enums / Structs ---
    enum AdapterStatus {
        PENDING, // 0: registered, awaiting governance activation
        ACTIVE, // 1: eligible for future allocator integration
        DISABLED, // 2: paused by Sentinel/governance (reversible)
        DEPRECATED // 3: terminal removal
    }

    struct Adapter {
        bytes32 adapterId; // e.g., keccak256("ENSURO_V3")
        address adapter; // external contract implementing IRiskPoolAdapter
        string name; // display name (e.g., "Ensuro")
        bytes32 metadataHash; // hash of due-diligence/integration docs
        uint256 exposureCap; // max exposure via this adapter (USDC, 6 decimals)
        AdapterStatus status;
        uint64 registeredAt;
        uint64 updatedAt;
    }

    // --- State ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    mapping(bytes32 => Adapter) private _adapters;
    bytes32[] private _adapterIds;

    // --- Events ---
    event AdapterRegistered(
        bytes32 indexed adapterId, address indexed adapter, string name, bytes32 metadataHash, uint256 exposureCap
    );
    event AdapterActivated(bytes32 indexed adapterId, address indexed by);
    event AdapterDisabled(bytes32 indexed adapterId, address indexed by);
    event AdapterDeprecated(bytes32 indexed adapterId, address indexed by);
    event AdapterExposureCapUpdated(bytes32 indexed adapterId, uint256 exposureCap);
    event AdapterMetadataUpdated(bytes32 indexed adapterId, bytes32 metadataHash);

    // --- Errors ---
    error AdapterRegistry__UnauthorizedRole(address caller, bytes32 role);
    error AdapterRegistry__InvalidParams();
    error AdapterRegistry__AdapterNotFound(bytes32 adapterId);
    error AdapterRegistry__DuplicateAdapter(bytes32 adapterId);
    error AdapterRegistry__InvalidStatus(bytes32 adapterId, AdapterStatus status);

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert AdapterRegistry__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(address protocolRoles_) {
        if (protocolRoles_ == address(0)) revert AdapterRegistry__InvalidParams();
        protocolRoles = ProtocolRoles(protocolRoles_);
    }

    // --- Curator: registration & parameters ---

    /// @notice Register an external adapter as PENDING. Only UNDERWRITING_CURATOR_ROLE.
    function registerAdapter(
        bytes32 adapterId,
        address adapter,
        string calldata name,
        bytes32 metadataHash,
        uint256 exposureCap
    ) external onlyProtocolRole(UNDERWRITING_CURATOR_ROLE) {
        if (adapterId == bytes32(0) || adapter == address(0) || metadataHash == bytes32(0) || bytes(name).length == 0) {
            revert AdapterRegistry__InvalidParams();
        }
        if (_adapters[adapterId].adapter != address(0)) {
            revert AdapterRegistry__DuplicateAdapter(adapterId);
        }

        uint64 nowTs = uint64(block.timestamp);
        _adapters[adapterId] = Adapter({
            adapterId: adapterId,
            adapter: adapter,
            name: name,
            metadataHash: metadataHash,
            exposureCap: exposureCap,
            status: AdapterStatus.PENDING,
            registeredAt: nowTs,
            updatedAt: nowTs
        });
        _adapterIds.push(adapterId);

        emit AdapterRegistered(adapterId, adapter, name, metadataHash, exposureCap);
    }

    /// @notice Update the exposure cap. Only UNDERWRITING_CURATOR_ROLE.
    function setExposureCap(bytes32 adapterId, uint256 exposureCap)
        external
        onlyProtocolRole(UNDERWRITING_CURATOR_ROLE)
    {
        Adapter storage a = _getAdapter(adapterId);
        if (a.status == AdapterStatus.DEPRECATED) revert AdapterRegistry__InvalidStatus(adapterId, a.status);
        a.exposureCap = exposureCap;
        a.updatedAt = uint64(block.timestamp);
        emit AdapterExposureCapUpdated(adapterId, exposureCap);
    }

    /// @notice Update the metadata hash (new due-diligence docs). Only curator.
    function setMetadata(bytes32 adapterId, bytes32 metadataHash) external onlyProtocolRole(UNDERWRITING_CURATOR_ROLE) {
        if (metadataHash == bytes32(0)) revert AdapterRegistry__InvalidParams();
        Adapter storage a = _getAdapter(adapterId);
        if (a.status == AdapterStatus.DEPRECATED) revert AdapterRegistry__InvalidStatus(adapterId, a.status);
        a.metadataHash = metadataHash;
        a.updatedAt = uint64(block.timestamp);
        emit AdapterMetadataUpdated(adapterId, metadataHash);
    }

    // --- Governance / Sentinel: lifecycle ---

    /// @notice Activate a pending or disabled adapter. Only OWNER_ROLE (governance).
    function activateAdapter(bytes32 adapterId) external onlyProtocolRole(OWNER_ROLE) {
        Adapter storage a = _getAdapter(adapterId);
        if (a.status != AdapterStatus.PENDING && a.status != AdapterStatus.DISABLED) {
            revert AdapterRegistry__InvalidStatus(adapterId, a.status);
        }
        a.status = AdapterStatus.ACTIVE;
        a.updatedAt = uint64(block.timestamp);
        emit AdapterActivated(adapterId, msg.sender);
    }

    /// @notice Disable an adapter (risk action, reversible). Only SENTINEL_ROLE.
    ///         The Sentinel can reduce risk but cannot activate (separation).
    function disableAdapter(bytes32 adapterId) external onlyProtocolRole(SENTINEL_ROLE) {
        Adapter storage a = _getAdapter(adapterId);
        if (a.status == AdapterStatus.DEPRECATED) revert AdapterRegistry__InvalidStatus(adapterId, a.status);
        a.status = AdapterStatus.DISABLED;
        a.updatedAt = uint64(block.timestamp);
        emit AdapterDisabled(adapterId, msg.sender);
    }

    /// @notice Permanently deprecate an adapter. Only OWNER_ROLE. Terminal.
    function deprecateAdapter(bytes32 adapterId) external onlyProtocolRole(OWNER_ROLE) {
        Adapter storage a = _getAdapter(adapterId);
        if (a.status == AdapterStatus.DEPRECATED) revert AdapterRegistry__InvalidStatus(adapterId, a.status);
        a.status = AdapterStatus.DEPRECATED;
        a.updatedAt = uint64(block.timestamp);
        emit AdapterDeprecated(adapterId, msg.sender);
    }

    // --- Views ---

    /// @notice True only for ACTIVE adapters. Gate for future allocator integration.
    function isAdapterActive(bytes32 adapterId) external view returns (bool) {
        return _adapters[adapterId].status == AdapterStatus.ACTIVE;
    }

    function getAdapter(bytes32 adapterId) external view returns (Adapter memory) {
        Adapter memory a = _adapters[adapterId];
        if (a.adapter == address(0)) revert AdapterRegistry__AdapterNotFound(adapterId);
        return a;
    }

    function getAdapterIds() external view returns (bytes32[] memory) {
        return _adapterIds;
    }

    function getAdapterCount() external view returns (uint256) {
        return _adapterIds.length;
    }

    // --- Internal ---

    function _getAdapter(bytes32 adapterId) internal view returns (Adapter storage a) {
        a = _adapters[adapterId];
        if (a.adapter == address(0)) revert AdapterRegistry__AdapterNotFound(adapterId);
    }
}
