// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DeployStack} from "./DeployStack.s.sol";
import {RedemptionQueue} from "../src/RedemptionQueue.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

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

    /// @dev CLI entrypoint: reads configuration from env, then delegates.
    function run() external {
        runWithConfig(
            vm.envUint("PRIVATE_KEY"), // testnet placeholder key only
            vm.envOr("WRITE_DEPLOYMENT_JSON", true),
            uint64(vm.envOr("REDEMPTION_EPOCH_SECONDS", uint256(7 days)))
        );
    }

    /// @dev Parameterized entrypoint: tests call this directly (no env races).
    function runWithConfig(uint256 pk, bool writeJson, uint64 epochDuration_) public {
        // The role set comes from the stack's own env loader, so the CLI and the
        // parameterized path cannot drift apart. The same instance goes on to
        // deploy: a second one just to read env would cost a full copy of every
        // creation code in the protocol.
        stack = new DeployStack();
        _deploy(pk, writeJson, epochDuration_, stack.rolesFromEnv(vm.addr(pk)));
    }

    /// @dev Fully parameterized entrypoint: roles are an argument, not env.
    function runWithRoles(uint256 pk, bool writeJson, uint64 epochDuration_, DeployStack.RoleConfig memory roles)
        public
    {
        stack = new DeployStack();
        _deploy(pk, writeJson, epochDuration_, roles);
    }

    function _deploy(uint256 pk, bool writeJson, uint64 epochDuration_, DeployStack.RoleConfig memory roles) internal {
        // 1. Fresh stack generation (chain-guarded inside DeployStack).
        stack.runWithRoles(pk, writeJson, address(0), roles);

        epochDuration = epochDuration_;

        address deployer = vm.addr(pk);
        ProtocolRoles protocolRoles = stack.protocolRoles();
        ComplianceRegistry compliance = stack.compliance();
        bytes32 kycRole = protocolRoles.KYC_OPERATOR_ROLE();

        vm.startBroadcast(pk);

        // 2. One queue for the deployed vault.
        queue = new RedemptionQueue(address(protocolRoles), address(stack.vault()), epochDuration);

        // 3. Approve the queue as a custody venue so it can hold escrowed nbRV
        //    without tripping the compliance gate. Only KYC_OPERATOR_ROLE may
        //    do this, and with separated roles the deployer is not that
        //    operator. The deployer keeps OWNER_ROLE (the role admin) through
        //    the staging deploy, so it borrows the role for this one call and
        //    gives it back: the finished deployment has exactly the holders the
        //    configuration named, and the deployer is not a KYC operator in it.
        bool deployerWasOperator = protocolRoles.hasRole(kycRole, deployer);
        if (!deployerWasOperator) protocolRoles.grantRole(kycRole, deployer);
        compliance.setApprovedVenue(address(queue), true);
        if (!deployerWasOperator) protocolRoles.revokeRole(kycRole, deployer);

        vm.stopBroadcast();

        console2.log("=== NextBlock redemption queue deployed ===");
        console2.log("queue:        ", address(queue));
        console2.log("vault:        ", address(stack.vault()));
        console2.log("epoch (s):    ", epochDuration);
    }
}
