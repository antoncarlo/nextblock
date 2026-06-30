// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {RedemptionQueue} from "../src/RedemptionQueue.sol";

/// @title RedemptionKeeper
/// @author Anton Carlo Santoro
/// @notice Settlement keeper for the periodic-window RedemptionQueue. Settles the
///         current epoch once it has matured and actually holds requests, then
///         the queue opens the next epoch automatically. Idempotent and safe to
///         run on a schedule: it no-ops (no broadcast) when nothing is due, so a
///         cron caller never reverts or wastes a settlement on an empty epoch.
///
///         The keyed caller must hold ALLOCATOR_ROLE (the allocator bot on
///         staging). Reads the queue address from REDEMPTION_QUEUE_ADDRESS.
contract RedemptionKeeper is Script {
    /// @notice Why a settlement run was skipped (surfaced for cron logs/tests).
    enum SkipReason {
        NONE, // settled
        ALREADY_SETTLED,
        NO_REQUESTS,
        NOT_MATURED
    }

    function run() external {
        address queueAddr = vm.envAddress("REDEMPTION_QUEUE_ADDRESS");
        uint256 pk = vm.envUint("PRIVATE_KEY"); // keeper key (holds ALLOCATOR_ROLE)
        (bool settled, SkipReason reason) = settleIfDue(queueAddr, pk);
        if (settled) {
            console2.log("RedemptionKeeper: epoch settled.");
        } else {
            console2.log("RedemptionKeeper: skipped, reason code:", uint256(reason));
        }
    }

    /// @notice Settle the current epoch iff it is matured, unsettled and non-empty.
    /// @dev Parameterized (no env) so unit tests drive it deterministically without
    ///      touching process-global env vars (Foundry runs tests in parallel).
    /// @return settled True if a settlement was broadcast.
    /// @return reason  Skip classification when not settled.
    function settleIfDue(address queueAddr, uint256 pk) public returns (bool settled, SkipReason reason) {
        RedemptionQueue queue = RedemptionQueue(queueAddr);
        uint256 epochId = queue.currentEpochId();

        (uint256 totalRequested,,,, bool isSettled) = queue.epochs(epochId);
        if (isSettled) return (false, SkipReason.ALREADY_SETTLED);
        if (totalRequested == 0) return (false, SkipReason.NO_REQUESTS);
        if (queue.currentEpochMaturesAt() > uint64(block.timestamp)) {
            return (false, SkipReason.NOT_MATURED);
        }

        vm.broadcast(pk);
        queue.settleEpoch();
        return (true, SkipReason.NONE);
    }
}
