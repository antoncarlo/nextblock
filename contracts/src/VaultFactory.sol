// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {InsuranceVault} from "./InsuranceVault.sol";
import {ClaimReceipt} from "./ClaimReceipt.sol";
import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {VaultDeployer} from "./VaultDeployer.sol";

/// @title VaultFactory
/// @notice Deploys and tracks InsuranceVault instances.
/// @dev Infrastructure addresses (USDC, registry, oracle, claimReceipt) are set once
///      and shared by all vaults created through this factory.
///      Permissioned: only UNDERWRITING_CURATOR_ROLE can create a vault, and the
///      designated vault manager must also hold UNDERWRITING_CURATOR_ROLE.
///      Auto-registers new vaults as ClaimReceipt minters via registrar role.
///      Ownable is retained ONLY for owner() ABI compatibility; no function is
///      gated by onlyOwner.
contract VaultFactory is Ownable, ProtocolRoleConstants {
    // --- Immutables ---
    address public immutable asset;           // MockUSDC
    address public immutable policyRegistry;
    address public immutable oracle;
    address public immutable claimReceiptAddr;

    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;

    /// @notice Compliance registry shared by all vaults (nbUSDC gating).
    address public immutable complianceRegistry;

    /// @notice Institutional portfolio registry shared by all vaults.
    address public immutable portfolioRegistry;

    /// @notice External deployer holding the vault creation code (EIP-170:
    ///         keeps this factory's runtime bytecode under the 24,576B limit).
    VaultDeployer public immutable vaultDeployer;

    // --- State ---
    address[] public deployedVaults;
    mapping(address => bool) public isVault;

    // --- Events ---
    event VaultCreated(
        address indexed vault,
        string name,
        string symbol,
        string vaultName,
        address indexed vaultManager,
        uint256 bufferRatioBps,
        uint256 managementFeeBps
    );

    // --- Errors ---
    error VaultFactory__InvalidParams();
    error VaultFactory__UnauthorizedRole(address caller, bytes32 role);
    error VaultFactory__ManagerNotCurator(address manager);

    // --- Modifiers ---
    /// @dev Reverts unless msg.sender holds `role` in the central ProtocolRoles manager.
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert VaultFactory__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    constructor(
        address asset_,
        address policyRegistry_,
        address oracle_,
        address claimReceipt_,
        address protocolRoles_,
        address complianceRegistry_,
        address portfolioRegistry_,
        address vaultDeployer_
    ) Ownable(msg.sender) {
        if (asset_ == address(0) || policyRegistry_ == address(0) ||
            oracle_ == address(0) || claimReceipt_ == address(0) ||
            protocolRoles_ == address(0) || complianceRegistry_ == address(0) ||
            portfolioRegistry_ == address(0) || vaultDeployer_ == address(0)) {
            revert VaultFactory__InvalidParams();
        }
        vaultDeployer = VaultDeployer(vaultDeployer_);
        asset = asset_;
        policyRegistry = policyRegistry_;
        oracle = oracle_;
        claimReceiptAddr = claimReceipt_;
        protocolRoles = ProtocolRoles(protocolRoles_);
        complianceRegistry = complianceRegistry_;
        portfolioRegistry = portfolioRegistry_;
    }

    /// @notice Create a new InsuranceVault with the specified parameters.
    ///         Permissioned: caller must hold UNDERWRITING_CURATOR_ROLE, and the
    ///         designated vault manager must also hold UNDERWRITING_CURATOR_ROLE.
    ///         msg.sender becomes vault owner.
    /// @param name Share token name (e.g., "NextBlock Balanced Core")
    /// @param symbol Share token symbol (e.g., "nxbBAL")
    /// @param vaultName Display name for the vault
    /// @param vaultManager_ Address of the vault manager (Underwriting Curator)
    /// @param bufferRatioBps_ Buffer ratio in basis points (e.g., 2000 = 20%)
    /// @param managementFeeBps_ Annual management fee in basis points (e.g., 50 = 0.5%)
    /// @return vault The address of the newly deployed vault
    function createVault(
        string memory name,
        string memory symbol,
        string memory vaultName,
        address vaultManager_,
        uint256 bufferRatioBps_,
        uint256 managementFeeBps_
    ) external onlyProtocolRole(UNDERWRITING_CURATOR_ROLE) returns (address vault) {
        if (vaultManager_ == address(0)) revert VaultFactory__InvalidParams();
        if (bufferRatioBps_ > BASIS_POINTS) revert VaultFactory__InvalidParams();
        if (managementFeeBps_ > BASIS_POINTS) revert VaultFactory__InvalidParams();
        if (!protocolRoles.hasRole(UNDERWRITING_CURATOR_ROLE, vaultManager_)) {
            revert VaultFactory__ManagerNotCurator(vaultManager_);
        }

        address newVault = vaultDeployer.deploy(
            InsuranceVault.VaultInitParams({
                asset: IERC20(asset),
                name: name,
                symbol: symbol,
                vaultName: vaultName,
                owner: msg.sender,       // owner of the vault = caller
                vaultManager: vaultManager_,
                bufferRatioBps: bufferRatioBps_,
                managementFeeBps: managementFeeBps_,
                registry: policyRegistry,
                oracle: oracle,
                claimReceipt: claimReceiptAddr,
                protocolRoles: address(protocolRoles),
                complianceRegistry: complianceRegistry,
                portfolioRegistry: portfolioRegistry
            })
        );

        vault = newVault;
        deployedVaults.push(vault);
        isVault[vault] = true;

        // Auto-register vault as ClaimReceipt minter (factory is registrar)
        ClaimReceipt(claimReceiptAddr).setAuthorizedMinter(vault, true);

        emit VaultCreated(vault, name, symbol, vaultName, vaultManager_, bufferRatioBps_, managementFeeBps_);
    }

    /// @notice Get all deployed vault addresses.
    function getVaults() external view returns (address[] memory) {
        return deployedVaults;
    }

    /// @notice Get the number of deployed vaults.
    function getVaultCount() external view returns (uint256) {
        return deployedVaults.length;
    }

    // --- Internal ---
    uint256 private constant BASIS_POINTS = 10_000;
}
