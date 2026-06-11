// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title ProtocolTimelock
/// @author Anton Carlo Santoro
/// @notice Governance timelock for NextBlock risk-increasing actions.
///         Designed to hold OWNER_ROLE (and DEFAULT_ADMIN_ROLE) on ProtocolRoles:
///         since every protocol module gates its OWNER-only configuration through
///         ProtocolRoles, routing those roles to this contract forces every
///         risk-increasing action (caps, premium splits, dispute windows, adapter
///         activation, fee claims, role grants) through schedule -> delay -> execute.
/// @dev Thin extension of the audited OpenZeppelin TimelockController:
///      - proposers (the protocol Safe) also receive CANCELLER_ROLE per OZ wiring;
///      - SENTINEL_ROLE actions are intentionally NOT timelocked: risk-reducing
///        powers (pause, dispute) must stay immediate and live outside this contract;
///      - MIN_ENFORCED_DELAY is a deploy-time floor. A later updateDelay below the
///        floor is not re-checked here, but updateDelay itself is only callable by
///        the timelock, so any change must first survive the governance delay.
contract ProtocolTimelock is TimelockController {
    /// @notice Deploy-time floor for the minimum operation delay.
    uint256 public constant MIN_ENFORCED_DELAY = 1 hours;

    // --- Errors ---
    error ProtocolTimelock__DelayTooShort(uint256 provided, uint256 minimum);
    error ProtocolTimelock__EmptyProposers();
    error ProtocolTimelock__EmptyExecutors();

    /// @param minDelay Seconds every operation must wait between schedule and execute.
    /// @param proposers Addresses allowed to schedule and cancel (protocol Safe).
    /// @param executors Addresses allowed to execute matured operations. An explicit
    ///        entry of address(0) opts into open execution per OZ semantics.
    /// @param admin Optional bootstrap admin; pass address(0) for a self-administered
    ///        timelock from genesis (recommended).
    constructor(uint256 minDelay, address[] memory proposers, address[] memory executors, address admin)
        TimelockController(minDelay, proposers, executors, admin)
    {
        if (minDelay < MIN_ENFORCED_DELAY) {
            revert ProtocolTimelock__DelayTooShort(minDelay, MIN_ENFORCED_DELAY);
        }
        if (proposers.length == 0) revert ProtocolTimelock__EmptyProposers();
        if (executors.length == 0) revert ProtocolTimelock__EmptyExecutors();
    }
}
