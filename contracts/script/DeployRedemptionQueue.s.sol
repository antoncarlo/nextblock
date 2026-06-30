// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DeployStack} from "./DeployStack.s.sol";
import {RedemptionQueue} from "../src/RedemptionQueue.sol";

/// @title DeployRedemptionQueue
/// @author Anton Carlo Santoro
/// @notice Deploys the periodic-window, pro-rata RedemptionQueue on top of a
///         fresh NextBlock stack generation (whose ComplianceRegistry supports
///         `approvedVenue`): one queue bound to the deployed vault, plus the
///         KYC-operator venue approval so the queue can custody escrowed nbRV.
///
///         The queue serves only ABOVE-buffer LP exits — within-buffer
///         redemptions stay instant on the vault itself. Settlement is driven
///         by a keeper holding ALLOCATOR_ROLE (granted to the allocator bot in
///         the underlying DeployStack), so no extra grant is required here.
///
///         Base-only: the chain guard lives in DeployStack (local 31337 / Base
///         Sepolia 84532). A fresh generation is deployed on purpose — the
///         existing staging vault is bound to a registry without `approvedVenue`
///         and cannot be repointed (immutable in its constructor).
contract DeployRedemptionQueue is Script {
    DeployStack public stack;
    RedemptionQueue public queue;

    /// @notice Notice period for the redemption window. Env-overridable for
    ///         staging demos; defaults to the institutional 7-day cadence.
    ///         Bounded by the queue itself to [1 hours, 90 days].
    uint64 public epochDuration;

    function run() external {
        // 1. Fresh stack generation (chain-guarded inside DeployStack).
        stack = new DeployStack();
        stack.run();

        uint256 pk = vm.envUint("PRIVATE_KEY"); // testnet placeholder key only
        epochDuration = uint64(vm.envOr("REDEMPTION_EPOCH_SECONDS", uint256(7 days)));

        vm.startBroadcast(pk);

        // 2. One queue for the deployed vault.
        queue = new RedemptionQueue(address(stack.protocolRoles()), address(stack.vault()), epochDuration);

        // 3. Approve the queue as a custody venue (deployer holds KYC_OPERATOR_ROLE),
        //    so it can hold escrowed nbRV without tripping the compliance gate.
        stack.compliance().setApprovedVenue(address(queue), true);

        vm.stopBroadcast();

        console2.log("=== NextBlock redemption queue deployed ===");
        console2.log("queue:        ", address(queue));
        console2.log("vault:        ", address(stack.vault()));
        console2.log("epoch (s):    ", epochDuration);
    }
}
