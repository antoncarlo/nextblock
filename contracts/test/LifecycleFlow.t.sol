// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DeployStack} from "../script/DeployStack.s.sol";
import {LifecycleFlow} from "../script/LifecycleFlow.s.sol";
import {InsuranceVault} from "../src/InsuranceVault.sol";
import {PolicyRegistry} from "../src/PolicyRegistry.sol";

/// @title LifecycleFlowTest
/// @author Anton Carlo Santoro
/// @notice Proves the lifecycle script does what it claims: a premium that
///         starts fully unearned ends fully earned, and the share price rises
///         because of it.
/// @dev The script's purpose is to make a vault's figures move on a live
///      deployment, and the only way to check that without a live deployment is
///      to build one locally and watch the same numbers. So this deploys a
///      stack, writes the record the script reads, runs it, and asserts the
///      progression rather than merely that it did not revert.
contract LifecycleFlowTest is Test {
    uint256 internal constant ANVIL_PK = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    DeployStack internal deployer;
    LifecycleFlow internal flow;

    function setUp() public {
        // writeJson = true: the lifecycle script binds by reading the record,
        // exactly as it will on staging. Constructing it any other way would
        // test a path nobody runs.
        deployer = new DeployStack();
        deployer.runWithConfig(ANVIL_PK, true, address(0));
        flow = new LifecycleFlow();
    }

    /// @notice A year of premium earns fully, and the share price rises with it.
    function test_premiumEarnsAcrossTheYear() public {
        InsuranceVault vault = deployer.vault();
        PolicyRegistry policies = deployer.policyRegistry();

        uint256 clockBefore = policies.currentTime();
        (, uint256 unearnedBefore,,,,,,) = vault.getVaultAccounting();
        uint256 priceBefore = vault.convertToAssets(1e18);

        flow.runWithKey(ANVIL_PK, 365);

        (uint256 balanceAfter, uint256 unearnedAfter,,,,,,) = vault.getVaultAccounting();
        uint256 priceAfter = vault.convertToAssets(1e18);

        assertGt(policies.currentTime(), clockBefore, "the registry clock did not move");
        assertGt(balanceAfter, 0, "no premium reached the vault");

        // At the end of a policy's own duration nothing of its premium remains
        // unearned. This is the whole point of the exercise: the figure the app
        // shows as UPR has to fall to zero on its own.
        assertEq(unearnedAfter, 0, "premium was still unearned at expiry");
        assertGe(unearnedBefore, unearnedAfter, "unearned premium did not fall");

        // Earned premium belongs to the shareholders, so the price of a share
        // must rise. A price that stayed flat would mean the vault took the
        // money and gave the LPs nothing.
        assertGt(priceAfter, priceBefore, "earning the premium did not lift the share price");
    }

    /// @notice The script refuses to run once real time is locked.
    /// @dev The lock is one-way and exists so nobody can fast-forward earnings.
    ///      A script that quietly no-ops after it would be worse than one that
    ///      stops: the operator would believe time advanced when it had not.
    function test_refusesToRunOnceTheClockIsLocked() public {
        PolicyRegistry policies = deployer.policyRegistry();

        vm.prank(vm.addr(ANVIL_PK));
        policies.lockRealTime();

        vm.expectRevert(bytes("LifecycleFlow: real time is locked; this script cannot advance it"));
        flow.runWithKey(ANVIL_PK, 365);
    }
}
