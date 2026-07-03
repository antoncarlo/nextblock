// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InsuranceVault} from "./InsuranceVault.sol";

/// @title VaultDeployer
/// @author Anton Carlo Santoro
/// @notice Single-purpose deployer that holds the `InsuranceVault` creation
///         code so the `VaultFactory` does not have to embed it.
///
///         WHY THIS EXISTS (EIP-170): a factory that executes
///         `new InsuranceVault(...)` embeds the vault's full creation code in
///         its own runtime bytecode. That pushed `VaultFactory` to 24,972 bytes,
///         above the 24,576-byte EIP-170 limit enforced on Base Sepolia
///         (found by the Phase 12 deployment dry run — local test EVMs do not
///         enforce the limit). Splitting creation into this contract keeps
///         both sides comfortably under the limit and makes the factory size
///         independent of future vault growth.
///
///         SECURITY: bind-once pattern. Only the bound `VaultFactory` can
///         deploy through this contract, so every vault still goes through the
///         factory's curator gating and registration. The deployer holds no
///         funds and has no other authority.
contract VaultDeployer {
    /// @notice Deployer admin allowed to bind the factory exactly once.
    address public immutable admin;

    /// @notice The only address allowed to call deploy() after binding.
    address public factory;

    /// @notice Emitted when the factory is bound (one-time).
    event FactoryBound(address indexed factory);
    /// @notice Emitted when a vault is deployed for the bound factory.
    event VaultDeployed(address indexed vault, address indexed factory);

    /// @notice Zero address/value or otherwise malformed parameters.
    error VaultDeployer__InvalidParams();
    /// @notice The factory binding is one-time.
    error VaultDeployer__AlreadyBound();
    /// @notice Caller is not the binding admin.
    error VaultDeployer__NotAdmin(address caller);
    /// @notice Caller is not the bound factory.
    error VaultDeployer__NotFactory(address caller);

    /// @notice Records the deployer as the one-time binding admin.
    constructor() {
        admin = msg.sender;
    }

    /// @notice Bind the factory. One-shot, admin only.
    function bindFactory(address factory_) external {
        if (msg.sender != admin) revert VaultDeployer__NotAdmin(msg.sender);
        if (factory_ == address(0)) revert VaultDeployer__InvalidParams();
        if (factory != address(0)) revert VaultDeployer__AlreadyBound();
        factory = factory_;
        emit FactoryBound(factory_);
    }

    /// @notice Deploy an InsuranceVault. Only the bound factory: vault creation
    ///         always passes through the factory's curator gate.
    function deploy(InsuranceVault.VaultInitParams memory params) external returns (address vault) {
        if (msg.sender != factory) revert VaultDeployer__NotFactory(msg.sender);
        vault = address(new InsuranceVault(params));
        emit VaultDeployed(vault, msg.sender);
    }
}
