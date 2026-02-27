// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {InsuranceVault} from "./InsuranceVault.sol";
import {ClaimReceipt} from "./ClaimReceipt.sol";

/// @title VaultFactory
/// @notice Deploys and tracks InsuranceVault instances.
/// @dev Infrastructure addresses (USDC, registry, oracle, claimReceipt) are set once
///      and shared by all vaults created through this factory.
///      Permissionless: anyone can create a vault (they become vault owner).
///      Auto-registers new vaults as ClaimReceipt minters via registrar role.
contract VaultFactory is Ownable {
    // --- Immutables ---
    address public immutable asset;           // MockUSDC
    address public immutable policyRegistry;
    address public immutable oracle;
    address public immutable claimReceiptAddr;

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

    constructor(
        address asset_,
        address policyRegistry_,
        address oracle_,
        address claimReceipt_
    ) Ownable(msg.sender) {
        if (asset_ == address(0) || policyRegistry_ == address(0) ||
            oracle_ == address(0) || claimReceipt_ == address(0)) {
            revert VaultFactory__InvalidParams();
        }
        asset = asset_;
        policyRegistry = policyRegistry_;
        oracle = oracle_;
        claimReceiptAddr = claimReceipt_;
    }

    /// @notice Create a new InsuranceVault with the specified parameters.
    ///         Permissionless: anyone can create a vault. msg.sender becomes vault owner.
    /// @param name Share token name (e.g., "NextBlock Balanced Core")
    /// @param symbol Share token symbol (e.g., "nxbBAL")
    /// @param vaultName Display name for the vault
    /// @param vaultManager_ Address of the vault manager (curator)
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
    ) external returns (address vault) {
        if (vaultManager_ == address(0)) revert VaultFactory__InvalidParams();
        if (bufferRatioBps_ > BASIS_POINTS) revert VaultFactory__InvalidParams();
        if (managementFeeBps_ > BASIS_POINTS) revert VaultFactory__InvalidParams();

        InsuranceVault newVault = new InsuranceVault(
            IERC20(asset),
            name,
            symbol,
            vaultName,
            msg.sender,       // owner of the vault = caller
            vaultManager_,
            bufferRatioBps_,
            managementFeeBps_,
            policyRegistry,
            oracle,
            claimReceiptAddr
        );

        vault = address(newVault);
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
