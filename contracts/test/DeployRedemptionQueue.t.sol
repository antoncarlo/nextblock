// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployRedemptionQueue} from "../script/DeployRedemptionQueue.s.sol";
import {DeployStack} from "../script/DeployStack.s.sol";
import {RedemptionQueue} from "../src/RedemptionQueue.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {ProtocolRoles} from "../src/ProtocolRoles.sol";

/// @title DeployRedemptionQueueTest
/// @notice Full-stack-plus-queue deploy on the local chain (31337): one queue
///         bound to the deployed vault, the KYC-operator venue approval, and a
///         keeper able to settle (ALLOCATOR_ROLE from the underlying stack).
contract DeployRedemptionQueueTest is Test {
    /// @dev Anvil default key #0 — TESTNET PLACEHOLDER, publicly known.
    uint256 constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address constant ANVIL_DEPLOYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;

    DeployRedemptionQueue deploy;

    function setUp() public {
        deploy = new DeployRedemptionQueue();
    }

    function test_run_deploysWiresAndApprovesQueue() public {
        deploy.runWithConfig(ANVIL_PK, false, 7 days);

        RedemptionQueue queue = deploy.queue();

        // Queue bound to the deployed stack's vault and roles.
        assertEq(address(queue.vault()), address(deploy.stack().vault()), "vault binding");
        assertEq(address(queue.protocolRoles()), address(deploy.stack().protocolRoles()), "roles binding");

        // Venue approved so the queue may custody escrowed nbRV.
        ComplianceRegistry compliance = deploy.stack().compliance();
        assertTrue(compliance.approvedVenue(address(queue)), "venue not approved");

        // The allocator bot (deployer on staging) can settle: it holds ALLOCATOR_ROLE.
        ProtocolRoles roles = deploy.stack().protocolRoles();
        assertTrue(roles.hasRole(roles.ALLOCATOR_ROLE(), ANVIL_DEPLOYER), "keeper lacks ALLOCATOR_ROLE");
    }

    /// @dev Every test above deploys with all roles on one key, which is the one
    ///      world where "the deployer holds KYC_OPERATOR_ROLE" is true. This
    ///      deploys the world the runbook asks for: eight distinct holders.
    ///      The venue approval is a KYC-operator call, so it must still work,
    ///      and it must not leave the deployer holding the role afterwards.
    function test_run_separatedRoles_approvesQueueAndLeavesNoOperatorRoleOnTheDeployer() public {
        DeployStack.RoleConfig memory cfg = DeployStack.RoleConfig({
            owner: makeAddr("owner"),
            curator: makeAddr("curator"),
            sentinel: makeAddr("sentinel"),
            committee: makeAddr("committee"),
            allocatorBot: makeAddr("allocatorBot"),
            oracleNode: makeAddr("oracleNode"),
            cedant: makeAddr("cedant"),
            kycOperator: makeAddr("kycOperator")
        });

        deploy.runWithRoles(ANVIL_PK, false, 7 days, cfg);

        ProtocolRoles roles = deploy.stack().protocolRoles();
        assertTrue(deploy.stack().compliance().approvedVenue(address(deploy.queue())), "venue not approved");

        // Each named holder has exactly its role...
        assertTrue(roles.hasRole(roles.OWNER_ROLE(), cfg.owner), "owner");
        assertTrue(roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), cfg.curator), "curator");
        assertTrue(roles.hasRole(roles.SENTINEL_ROLE(), cfg.sentinel), "sentinel");
        assertTrue(roles.hasRole(roles.CLAIMS_COMMITTEE_ROLE(), cfg.committee), "committee");
        assertTrue(roles.hasRole(roles.ALLOCATOR_ROLE(), cfg.allocatorBot), "allocator");
        assertTrue(roles.hasRole(roles.ORACLE_ROLE(), cfg.oracleNode), "oracle");
        assertTrue(roles.hasRole(roles.AUTHORIZED_CEDANT_ROLE(), cfg.cedant), "cedant");
        assertTrue(roles.hasRole(roles.KYC_OPERATOR_ROLE(), cfg.kycOperator), "kyc operator");

        // ...and the deployer holds none of the operator roles it borrowed or
        // was never meant to have.
        assertFalse(roles.hasRole(roles.KYC_OPERATOR_ROLE(), ANVIL_DEPLOYER), "deployer left a KYC operator");
        assertFalse(
            roles.hasRole(roles.UNDERWRITING_CURATOR_ROLE(), ANVIL_DEPLOYER), "deployer stayed an underwriting curator"
        );
        assertFalse(roles.hasRole(roles.ALLOCATOR_ROLE(), ANVIL_DEPLOYER), "deployer is an allocator");
        assertFalse(roles.hasRole(roles.SENTINEL_ROLE(), ANVIL_DEPLOYER), "deployer is a sentinel");
        assertFalse(roles.hasRole(roles.CLAIMS_COMMITTEE_ROLE(), ANVIL_DEPLOYER), "deployer is on the committee");
        assertFalse(roles.hasRole(roles.ORACLE_ROLE(), ANVIL_DEPLOYER), "deployer is an oracle");
        assertFalse(roles.hasRole(roles.AUTHORIZED_CEDANT_ROLE(), ANVIL_DEPLOYER), "deployer is a cedant");
    }

    /// @dev Baseline and override epoch config, parameterized — no env, so no
    ///      race with parallel suites (vm.setEnv is process-global).
    function test_run_epochConfig_baselineThenOverride() public {
        DeployRedemptionQueue d7 = new DeployRedemptionQueue();
        d7.runWithConfig(ANVIL_PK, false, 7 days);
        assertEq(d7.queue().epochDuration(), 7 days, "baseline 7-day epoch");

        DeployRedemptionQueue d1 = new DeployRedemptionQueue();
        d1.runWithConfig(ANVIL_PK, false, 1 days);
        assertEq(d1.queue().epochDuration(), 1 days, "epoch override");
    }

    function test_run_rejectsUnexpectedChain() public {
        // The underlying stack guards the chain: mainnet must be refused.
        vm.chainId(1);
        vm.expectRevert();
        deploy.runWithConfig(ANVIL_PK, false, 7 days);
    }
}
